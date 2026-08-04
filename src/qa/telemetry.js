import fs from 'node:fs/promises';
import path from 'node:path';

const PAGE_SIZE = 4096;

export async function startTelemetry({
  sessionDir,
  intervalMs = 2000,
  browserMetricsEvery = 3,
  fpsWindowMs = 400,
  getProcesses,
  getCdp,
}) {
  const outputPath = path.join(sessionDir, 'resources.ndjson');
  let stopped = false;
  let inFlight = null;
  let sampleIndex = 0;

  const sample = async () => {
    if (stopped || inFlight) return;
    inFlight = (async () => {
      const processes = getProcesses?.() ?? {};
      const record = {
        at: new Date().toISOString(),
        host: await readHostSnapshot(),
        processGroups: {},
      };

      for (const [name, child] of Object.entries(processes)) {
        if (!child?.pid) continue;
        const snapshot = await readProcessGroupSnapshot(child.pid);
        if (snapshot) record.processGroups[name] = snapshot;
      }

      if (browserMetricsEvery > 0 && sampleIndex % browserMetricsEvery === 0) {
        const cdp = getCdp?.();
        if (cdp?.send) record.browser = await readBrowserSnapshot(cdp, fpsWindowMs);
      }
      sampleIndex += 1;
      await fs.appendFile(outputPath, `${JSON.stringify(record)}\n`);
    })().finally(() => {
      inFlight = null;
    });
    await inFlight;
  };

  await sample();
  const timer = setInterval(() => void sample(), Math.max(250, Number(intervalMs) || 2000));
  timer.unref?.();

  return {
    outputPath,
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (inFlight) await inFlight;
      await sampleFinal(outputPath, getProcesses?.() ?? {}, getCdp?.(), fpsWindowMs);
    },
  };
}

export async function summarizeTelemetry(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const records = text.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  if (records.length === 0) return null;

  const peakRssBytes = {};
  const processGroups = {};
  let minHostAvailableBytes = null;
  const fps = [];
  for (const record of records) {
    const available = record.host?.memoryAvailableBytes;
    if (Number.isFinite(available)) minHostAvailableBytes = minHostAvailableBytes === null ? available : Math.min(minHostAvailableBytes, available);
    for (const [name, group] of Object.entries(record.processGroups ?? {})) {
      const rss = Number(group.rssBytes ?? 0);
      const cpuTicks = Number(group.cpuTicks ?? 0);
      const state = processGroups[name] ?? { samples: 0, firstRssBytes: rss, lastRssBytes: rss, peakRssBytes: 0, firstCpuTicks: cpuTicks, lastCpuTicks: cpuTicks, peakProcessCount: 0 };
      state.samples += 1;
      state.lastRssBytes = rss;
      state.peakRssBytes = Math.max(state.peakRssBytes, rss);
      state.lastCpuTicks = cpuTicks;
      state.peakProcessCount = Math.max(state.peakProcessCount, Number(group.processCount ?? 0));
      processGroups[name] = state;
      peakRssBytes[name] = state.peakRssBytes;
    }
    if (Number.isFinite(record.browser?.fps)) fps.push(record.browser.fps);
  }
  for (const state of Object.values(processGroups)) {
    state.rssDeltaBytes = state.lastRssBytes - state.firstRssBytes;
    state.cpuTicksDelta = state.lastCpuTicks - state.firstCpuTicks;
    delete state.firstCpuTicks;
    delete state.lastCpuTicks;
  }

  return {
    samples: records.length,
    firstAt: records[0]?.at ?? null,
    lastAt: records.at(-1)?.at ?? null,
    peakRssBytes,
    processGroups,
    minHostAvailableBytes,
    browserFps: fps.length > 0 ? {
      samples: fps.length,
      average: round(fps.reduce((sum, value) => sum + value, 0) / fps.length),
      minimum: round(Math.min(...fps)),
      maximum: round(Math.max(...fps)),
    } : null,
  };
}

async function sampleFinal(outputPath, processes, cdp, fpsWindowMs) {
  const record = {
    at: new Date().toISOString(),
    final: true,
    host: await readHostSnapshot(),
    processGroups: {},
  };
  for (const [name, child] of Object.entries(processes)) {
    if (!child?.pid) continue;
    const snapshot = await readProcessGroupSnapshot(child.pid);
    if (snapshot) record.processGroups[name] = snapshot;
  }
  if (cdp?.send) record.browser = await readBrowserSnapshot(cdp, fpsWindowMs);
  await fs.appendFile(outputPath, `${JSON.stringify(record)}\n`);
}

async function readHostSnapshot() {
  const snapshot = {
    loadAverage: null,
    memoryTotalBytes: null,
    memoryAvailableBytes: null,
  };
  try {
    snapshot.loadAverage = (await fs.readFile('/proc/loadavg', 'utf8')).trim().split(/\s+/).slice(0, 3).map(Number);
  } catch {}
  try {
    const values = parseKeyValue(await fs.readFile('/proc/meminfo', 'utf8'));
    snapshot.memoryTotalBytes = kibToBytes(values.MemTotal);
    snapshot.memoryAvailableBytes = kibToBytes(values.MemAvailable);
  } catch {}
  return snapshot;
}

async function readProcessGroupSnapshot(groupPid) {
  const target = Number(groupPid);
  if (!Number.isInteger(target) || target <= 1) return null;
  let entries;
  try {
    entries = await fs.readdir('/proc', { withFileTypes: true });
  } catch {
    return null;
  }

  let processCount = 0;
  let rssBytes = 0;
  let cpuTicks = 0;
  const leaders = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    const stat = await readProcStat(pid);
    if (!stat || stat.pgrp !== target) continue;
    processCount += 1;
    rssBytes += Math.max(0, stat.rssPages) * PAGE_SIZE;
    cpuTicks += stat.utimeTicks + stat.stimeTicks;
    if (leaders.length < 12) leaders.push({ pid, comm: stat.comm });
  }
  if (processCount === 0) return null;
  return { leaderPid: target, processCount, rssBytes, cpuTicks, members: leaders };
}

async function readProcStat(pid) {
  try {
    const value = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
    const open = value.indexOf('(');
    const close = value.lastIndexOf(')');
    if (open === -1 || close === -1) return null;
    const comm = value.slice(open + 1, close);
    const fields = value.slice(close + 2).trim().split(/\s+/);
    return {
      comm,
      pgrp: Number(fields[2]),
      utimeTicks: Number(fields[11]) || 0,
      stimeTicks: Number(fields[12]) || 0,
      rssPages: Number(fields[21]) || 0,
    };
  } catch {
    return null;
  }
}

async function readBrowserSnapshot(cdp, fpsWindowMs) {
  const output = { performance: null, fps: null };
  try {
    const result = await cdp.send('Performance.getMetrics');
    output.performance = Object.fromEntries((result.metrics ?? [])
      .filter((metric) => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents', 'Frames', 'LayoutCount', 'RecalcStyleCount', 'TaskDuration'].includes(metric.name))
      .map((metric) => [metric.name, metric.value]));
  } catch {}

  try {
    const expression = `new Promise(resolve => { const start = performance.now(); let frames = 0; const tick = now => { frames += 1; if (now - start >= ${Math.max(100, Number(fpsWindowMs) || 400)}) resolve({ frames, durationMs: now - start }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`;
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const value = result?.result?.value;
    if (value?.durationMs > 0) output.fps = round((value.frames * 1000) / value.durationMs);
  } catch {}
  return output;
}

function parseKeyValue(text) {
  const output = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([^:]+):\s+(\d+)/);
    if (match) output[match[1]] = Number(match[2]);
  }
  return output;
}

function kibToBytes(value) {
  return Number.isFinite(value) ? value * 1024 : null;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
