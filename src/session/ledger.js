import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists, readJson, writeJson } from '../lib/fs.js';
import { commandExists, waitForExit } from '../lib/process.js';
import { spawn } from 'node:child_process';
import { summarizeTelemetry } from '../qa/telemetry.js';

export function sessionsRoot(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot), '.64less', 'sessions');
}

export function currentSessionPath(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot), '.64less', 'current-session.json');
}

export async function processStartTicks(pid = process.pid) {
  try {
    const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
    const closeParen = stat.lastIndexOf(')');
    if (closeParen === -1) return null;
    const fields = stat.slice(closeParen + 2).trim().split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

export async function processIdentity(name, child, { group = false } = {}) {
  if (!child?.pid) return null;
  return {
    name,
    pid: child.pid,
    startTicks: await processStartTicks(child.pid),
    group,
  };
}

export async function loadCurrentMarker(workspaceRoot) {
  const markerPath = currentSessionPath(workspaceRoot);
  if (!(await pathExists(markerPath))) return null;
  return { markerPath, marker: await readJson(markerPath) };
}

export async function validateCurrentMarker(workspaceRoot, marker) {
  const root = sessionsRoot(workspaceRoot);
  const sessionDir = path.resolve(marker.sessionDir ?? '');
  const safePath = sessionDir.startsWith(`${path.resolve(root)}${path.sep}`);
  const sessionExists = safePath && await pathExists(sessionDir);
  const pid = Number(marker.pid);
  const alive = Number.isInteger(pid) && pid > 0 ? isPidAlive(pid) : false;
  const actualStartTicks = alive ? await processStartTicks(pid) : null;
  const identityMatches = Boolean(
    alive
    && marker.controllerStartTicks
    && actualStartTicks
    && String(marker.controllerStartTicks) === String(actualStartTicks),
  );

  return {
    safePath,
    sessionExists,
    pidAlive: alive,
    identityMatches,
    live: safePath && sessionExists && alive && identityMatches,
    actualStartTicks,
  };
}

export async function listSessions(workspaceRoot) {
  const root = sessionsRoot(workspaceRoot);
  if (!(await pathExists(root))) return [];
  const names = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const output = [];
  for (const name of names) output.push(await summarizeSession(path.join(root, name)));
  return output;
}

export async function summarizeSession(sessionDir) {
  const manifestPath = path.join(sessionDir, 'manifest.json');
  const manifest = (await pathExists(manifestPath)) ? await readJson(manifestPath) : null;
  const artifacts = [];
  for (const name of [
    'workspace.log',
    'browser.log',
    'chromium.log',
    'cdp.ndjson',
    'input.ndjson',
    'script-audit.ndjson',
    'events.ndjson',
    'resources.ndjson',
    'session.mkv',
    'session.mp4',
  ]) {
    const file = path.join(sessionDir, name);
    if (!(await pathExists(file))) continue;
    const stat = await fs.stat(file);
    artifacts.push({ name, bytes: stat.size });
  }
  const telemetry = await summarizeTelemetry(path.join(sessionDir, 'resources.ndjson'));
  return {
    sessionDir,
    name: path.basename(sessionDir),
    createdAt: manifest?.createdAt ?? null,
    endedAt: manifest?.endedAt ?? null,
    status: manifest?.status ?? (manifest?.endedAt ? 'unknown' : 'incomplete'),
    exit: manifest?.workspaceExit ?? null,
    browserRestarts: manifest?.browserRestarts ?? 0,
    telemetry,
    artifacts,
  };
}

export async function finalizeManifest(sessionDir, patch) {
  const manifestPath = path.join(sessionDir, 'manifest.json');
  const current = (await pathExists(manifestPath)) ? await readJson(manifestPath) : {};
  const merged = { ...current, ...patch };
  await writeJson(manifestPath, merged);
  return merged;
}

export async function appendSessionEvent(sessionDir, event) {
  await fs.appendFile(path.join(sessionDir, 'events.ndjson'), `${JSON.stringify({
    at: new Date().toISOString(),
    ...event,
  })}\n`);
}

export async function recoverStaleSession(workspaceRoot) {
  const current = await loadCurrentMarker(workspaceRoot);
  if (!current) return { recovered: false, reason: 'no-current-session' };

  const validation = await validateCurrentMarker(workspaceRoot, current.marker);
  if (validation.live) throw new Error('Refusing recovery: the 64less controller is still live');
  if (!validation.safePath) throw new Error('Refusing recovery: current-session.json points outside the workspace session root');
  if (!validation.sessionExists) {
    await fs.rm(current.markerPath, { force: true });
    return { recovered: true, reason: 'missing-session-directory', sessionDir: current.marker.sessionDir };
  }

  const sessionDir = path.resolve(current.marker.sessionDir);
  const terminated = [];
  const ownedProcesses = [...(current.marker.ownedProcesses ?? [])].sort((left, right) => recoveryPriority(left) - recoveryPriority(right));
  for (const owned of ownedProcesses) {
    if (await terminateOwnedProcess(owned)) terminated.push(owned.name ?? String(owned.pid));
  }

  const mkvPath = path.join(sessionDir, 'session.mkv');
  const mp4Path = path.join(sessionDir, 'session.mp4');
  let remuxed = false;
  if (await pathExists(mkvPath) && !(await pathExists(mp4Path)) && await commandExists('ffmpeg')) {
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', mkvPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      mp4Path,
    ], { stdio: 'ignore' });
    const result = await waitForExit(child);
    remuxed = result.code === 0;
  }

  let policyRestored = false;
  try {
    const { restoreLocalQaPolicyFromFile } = await import('../qa/chromium-policy.js');
    policyRestored = await restoreLocalQaPolicyFromFile(path.join(sessionDir, 'chromium-policy-state.json'));
  } catch {
    policyRestored = false;
  }

  await appendSessionEvent(sessionDir, {
    type: 'stale-session-recovered',
    priorPid: current.marker.pid ?? null,
    priorControllerStartTicks: current.marker.controllerStartTicks ?? null,
    remuxed,
    terminated,
    policyRestored,
  });
  await finalizeManifest(sessionDir, {
    endedAt: new Date().toISOString(),
    status: 'recovered-after-controller-loss',
    recovered: true,
  });
  await fs.rm(current.markerPath, { force: true });
  return { recovered: true, reason: 'stale-controller', sessionDir, remuxed, terminated, policyRestored };
}

function recoveryPriority(owned) {
  const name = String(owned?.name ?? '');
  if (name === 'browser') return 10;
  if (name === 'cockpit') return 20;
  if (name === 'workspace') return 30;
  if (name === 'recorder') return 40;
  if (name.startsWith('display-')) return 50;
  return 45;
}

async function terminateOwnedProcess(owned) {
  const pid = Number(owned?.pid);
  if (!Number.isInteger(pid) || pid <= 1 || !owned.startTicks) return false;
  const currentTicks = await processStartTicks(pid);
  if (!currentTicks || String(currentTicks) !== String(owned.startTicks)) return false;

  const target = owned.group ? -pid : pid;
  try {
    process.kill(target, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  const afterTicks = await processStartTicks(pid);
  if (afterTicks && String(afterTicks) === String(owned.startTicks)) {
    try {
      process.kill(target, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  return true;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}
