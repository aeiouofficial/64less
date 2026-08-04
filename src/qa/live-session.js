import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pathExists, readJson } from '../lib/fs.js';
import { processStartTicks, validateCurrentMarker } from '../session/ledger.js';
import { waitForExit } from '../lib/process.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function loadLiveSession(workspacePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const livePath = path.join(workspaceRoot, '.64less', 'current-session.json');
  if (!(await pathExists(livePath))) throw new Error('No live 64less QA session found for this workspace');
  const live = await readJson(livePath);
  const validation = await validateCurrentMarker(workspaceRoot, live);
  if (!validation.live) {
    throw new Error('The 64less session marker is stale or no longer belongs to the recorded controller; run 64less recover');
  }
  return { workspaceRoot, livePath, live, validation };
}

export async function loadReadyBrowserSession(workspacePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = 'browser not ready';
  while (Date.now() < deadline) {
    const session = await loadLiveSession(workspacePath);
    const browser = session.live.ownedProcesses?.find((item) => item.name === 'browser');
    if (browser?.pid && browser.startTicks) {
      const actualStartTicks = await processStartTicks(browser.pid);
      const identityMatches = actualStartTicks && String(actualStartTicks) === String(browser.startTicks);
      if (identityMatches && session.live.browserReady === true) return session;
      lastState = identityMatches ? 'browser CDP not ready' : 'browser process is restarting';
    } else {
      lastState = 'browser process is not recorded yet';
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for the live Chromium session: ${lastState}`);
}

export async function runPhysicalInput(live, action, args, extraLedger = {}) {
  const binary = path.join(projectRoot, 'runtime', 'bin', '64less-input');
  if (!(await pathExists(binary))) throw new Error('64less-input is not built; run scripts/build-native.sh');
  const child = spawn(binary, [action, ...args.map(String)], {
    env: { ...process.env, DISPLAY: live.display },
    stdio: 'inherit',
  });
  const result = await waitForExit(child);
  if (result.code !== 0) throw new Error(`Input helper failed with exit code ${result.code}`);
  await fs.appendFile(path.join(live.sessionDir, 'input.ndjson'), `${JSON.stringify({
    at: new Date().toISOString(),
    action,
    args,
    ...extraLedger,
  })}\n`);
}
