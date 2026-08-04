import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timestampForPath, writeJson } from '../lib/fs.js';
import { terminate, terminateTree, waitForExit } from '../lib/process.js';
import { startChromium } from '../qa/browser.js';
import { startCdpCapture } from '../qa/cdp.js';
import { startCockpit } from '../qa/cockpit.js';
import { prepareLocalQaPolicy, restoreLocalQaPolicy } from '../qa/chromium-policy.js';
import { startDisplay, stopDisplay } from '../qa/display.js';
import { startRecording, stopRecording } from '../qa/recording.js';
import { arrangeCockpit } from '../qa/window-layout.js';
import { startTelemetry } from '../qa/telemetry.js';
import { inspectTooling, missingRequiredTools } from '../qa/tooling.js';
import { inspectExecutors } from '../executors/index.js';
import { startWorkspaceProcess } from '../runtime/workspace-process.js';
import { appendSessionEvent, finalizeManifest, processIdentity, processStartTicks } from './ledger.js';
import { waitForWorkspaceUrl } from './url.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npmScriptShell = path.join(projectRoot, 'bin', '64less-script-shell.js');

export async function runSession({ workspace, config, launchPlan, qa = false, force = false }) {
  if (launchPlan.unsupported.length > 0 && !force) {
    throw new Error(`Unsupported Windows assumptions: ${launchPlan.unsupported.join(', ')}. Use 64less plan to inspect them.`);
  }

  const tooling = await inspectTooling({ qa });
  const executors = await inspectExecutors(config.executors ?? {});
  for (const requirement of launchPlan.executorRequirements ?? []) {
    const executor = executors[requirement.id];
    if (!requirement.configured) throw new Error(`Required executor is not enabled: ${requirement.id}`);
    if (!executor?.available) throw new Error(`Required executor is unavailable: ${requirement.id} (${requirement.command})`);
  }
  const missing = missingRequiredTools(tooling, { qa });
  if (missing.length > 0) throw new Error(`Missing required tools: ${missing.join(', ')}`);

  const sessionDir = path.join(workspace.root, '.64less', 'sessions', timestampForPath());
  await fs.mkdir(sessionDir, { recursive: true });
  const workspaceLog = path.join(sessionDir, 'workspace.log');
  const currentSessionPath = path.join(workspace.root, '.64less', 'current-session.json');
  const controllerStartTicks = await processStartTicks();

  await writeJson(path.join(sessionDir, 'manifest.json'), {
    createdAt: new Date().toISOString(),
    workspace: workspace.root,
    package: workspace.package,
    launchPlan,
    qa,
    tooling,
    status: 'running',
  });

  const state = {
    display: null,
    recorder: null,
    cockpit: null,
    browser: null,
    cdp: null,
    workspaceProcess: null,
    chromiumPolicy: null,
    browserReady: false,
    telemetry: null,
  };
  let stopping = false;
  let workspaceExit = null;
  let sessionError = null;
  let browserRestarts = 0;
  let resolvedUrl = null;

  const markerStartedAt = new Date().toISOString();
  const writeLiveMarker = async () => {
    if (!qa || !state.display) return;
    const owned = [];
    const candidates = [
      ['workspace', state.workspaceProcess, true],
      ['browser', state.browser, true],
      ['cockpit', state.cockpit, true],
      ['recorder', state.recorder?.child, false],
      ...((state.display?.processes ?? []).map((child, index) => [`display-${index}`, child, false])),
    ];
    for (const [name, child, group] of candidates) {
      const identity = await processIdentity(name, child, { group });
      if (identity) owned.push(identity);
    }
    await writeJson(currentSessionPath, {
      pid: process.pid,
      controllerStartTicks,
      sessionDir,
      display: state.display.display,
      size: config.qa.size,
      fps: config.qa.fps,
      remoteDebuggingPort: config.qa.remoteDebuggingPort,
      url: resolvedUrl ?? config.url,
      browserReady: state.browserReady,
      startedAt: markerStartedAt,
      ownedProcesses: owned,
    });
  };

  const startBrowserForSession = async ({ restart = false } = {}) => {
    if (stopping || !resolvedUrl) return;
    const browser = await startChromium({
      url: resolvedUrl,
      display: state.display.display,
      sessionDir,
      config: config.qa,
    });
    state.browser = browser.child;
    state.browserReady = false;
    await writeLiveMarker();
    await fs.appendFile(workspaceLog, `[64less] Chromium user: ${browser.identity?.name ?? 'current user'}${restart ? ' (restart)' : ''}\n`);

    if (config.qa.cockpit && tooling.wmctrl) {
      await delay(restart ? 650 : 900);
      if (!stopping) await arrangeCockpit({ display: state.display.display, size: config.qa.size });
    }

    try {
      state.cdp?.close();
      state.cdp = await startCdpCapture({
        port: config.qa.remoteDebuggingPort,
        sessionDir,
        url: resolvedUrl,
      });
      state.browserReady = true;
    } catch (error) {
      state.browserReady = false;
      await fs.appendFile(workspaceLog, `[64less] CDP capture unavailable: ${error.message}\n`);
    }
    await writeLiveMarker();
    await appendSessionEvent(sessionDir, {
      type: restart ? 'browser-restarted' : 'browser-started',
      pid: browser.child.pid ?? null,
      restartIndex: browserRestarts,
      cdpReady: state.browserReady,
    });

    browser.child.once('exit', (code, signal) => {
      void handleBrowserExit(browser.child, code, signal);
    });
  };

  const handleBrowserExit = async (child, code, signal) => {
    if (stopping || state.browser !== child) return;
    state.browserReady = false;
    state.cdp?.close();
    state.cdp = null;
    await writeLiveMarker();
    await appendSessionEvent(sessionDir, {
      type: 'browser-exited-unexpectedly',
      code,
      signal,
      restartIndex: browserRestarts,
    });

    const limit = Math.max(0, Number(config.qa.browserRestartLimit ?? 0));
    if (browserRestarts >= limit) {
      await appendSessionEvent(sessionDir, { type: 'browser-restart-limit-reached', limit });
      return;
    }

    browserRestarts += 1;
    await delay(500);
    if (!stopping) {
      try {
        await startBrowserForSession({ restart: true });
      } catch (error) {
        await appendSessionEvent(sessionDir, { type: 'browser-restart-failed', message: error.message });
      }
    }
  };

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (state.telemetry) await state.telemetry.stop();
    state.telemetry = null;
    state.cdp?.close();
    await terminateTree(state.browser);
    await terminateTree(state.cockpit);
    await terminateTree(state.workspaceProcess);
    if (state.recorder) await stopRecording(state.recorder, sessionDir);
    await stopDisplay(state.display);
    await restoreLocalQaPolicy(state.chromiumPolicy);
    await fs.rm(currentSessionPath, { force: true });
  };

  const onSignal = (signal) => {
    void appendSessionEvent(sessionDir, { type: 'controller-signal', signal });
    void stop();
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    if (qa) {
      state.chromiumPolicy = await prepareLocalQaPolicy({ recoveryStatePath: path.join(sessionDir, 'chromium-policy-state.json') });
      if (state.chromiumPolicy.blocked) {
        throw new Error('Chromium managed policy blocks localhost and 64less cannot add a scoped exception without root');
      }
      state.display = await startDisplay(config.qa);
      await writeLiveMarker();
      if (config.qa.record) {
        state.recorder = await startRecording({
          display: state.display.display,
          size: config.qa.size,
          fps: config.qa.fps,
          sessionDir,
        });
        await writeLiveMarker();
      }
    }

    const workspaceEnv = {
      ...config.env,
      ...(launchPlan.needsAdapterShell ? {
        npm_config_script_shell: npmScriptShell,
        SIXTYFOURLESS_DRIVE_MAPPINGS: JSON.stringify(config.windows.driveMappings ?? {}),
        SIXTYFOURLESS_SCRIPT_AUDIT: path.join(sessionDir, 'script-audit.ndjson'),
        SIXTYFOURLESS_FORCE: force ? '1' : '0',
        SIXTYFOURLESS_EXECUTORS: JSON.stringify(config.executors ?? {}),
      } : {}),
    };

    state.workspaceProcess = startWorkspaceProcess({
      workspaceRoot: workspace.root,
      command: launchPlan.launchCommand,
      env: workspaceEnv,
      logPath: workspaceLog,
    });
    if (qa && config.qa.telemetry !== false) {
      state.telemetry = await startTelemetry({
        sessionDir,
        intervalMs: config.qa.telemetryIntervalMs,
        browserMetricsEvery: config.qa.telemetryBrowserMetricsEvery,
        fpsWindowMs: config.qa.telemetryFpsWindowMs,
        getProcesses: () => ({ workspace: state.workspaceProcess, browser: state.browser }),
        getCdp: () => state.cdp,
      });
    }
    if (qa) await writeLiveMarker();

    if (qa && config.qa.cockpit && tooling.xterm) {
      state.cockpit = startCockpit({ display: state.display.display, size: config.qa.size, sessionDir });
      await writeLiveMarker();
    }

    if (qa) {
      resolvedUrl = await waitForWorkspaceUrl({
        configuredUrl: config.url,
        logPath: workspaceLog,
        timeoutMs: config.readyTimeoutMs,
        process: state.workspaceProcess,
      });
      await writeLiveMarker();
      await startBrowserForSession();
    }

    process.stdout.write(`64less session: ${sessionDir}\n`);
    if (resolvedUrl) process.stdout.write(`64less URL: ${resolvedUrl}\n`);
    workspaceExit = await waitForExit(state.workspaceProcess);
    return { ...workspaceExit, sessionDir, url: resolvedUrl, launchPlan };
  } catch (error) {
    sessionError = error;
    await appendSessionEvent(sessionDir, { type: 'session-error', message: error.message });
    throw error;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    await stop();
    await finalizeManifest(sessionDir, {
      endedAt: new Date().toISOString(),
      status: sessionError ? 'failed' : 'completed',
      workspaceExit,
      browserRestarts,
      error: sessionError ? { message: sessionError.message } : null,
    });
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
