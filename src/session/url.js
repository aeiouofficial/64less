import fs from 'node:fs/promises';

const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s]*)?/i;

export async function waitForWorkspaceUrl({ configuredUrl, logPath, timeoutMs, process: workspaceProcess = null }) {
  if (configuredUrl) {
    await waitForHttp(configuredUrl, timeoutMs, workspaceProcess);
    return configuredUrl;
  }

  const deadline = Date.now() + timeoutMs;
  let candidate = null;
  while (Date.now() < deadline) {
    if (workspaceProcess && (workspaceProcess.exitCode !== null || workspaceProcess.signalCode !== null)) {
      throw new Error(`Workspace process exited before readiness (code=${workspaceProcess.exitCode ?? 'null'}, signal=${workspaceProcess.signalCode ?? 'null'})`);
    }
    try {
      const text = await fs.readFile(logPath, 'utf8');
      const match = text.match(LOCAL_URL);
      if (match) candidate = cleanUrl(match[0]);
      if (candidate && await isReachable(candidate)) return candidate;
    } catch {
      // The log may not exist until the child writes its first line.
    }
    await delay(250);
  }
  throw new Error('Workspace did not expose a reachable localhost URL before the readiness timeout');
}

async function waitForHttp(url, timeoutMs, workspaceProcess = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (workspaceProcess && (workspaceProcess.exitCode !== null || workspaceProcess.signalCode !== null)) {
      throw new Error(`Workspace process exited before readiness (code=${workspaceProcess.exitCode ?? 'null'}, signal=${workspaceProcess.signalCode ?? 'null'})`);
    }
    if (await isReachable(url)) return;
    await delay(250);
  }
  throw new Error(`URL did not become reachable: ${url}`);
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(1500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function cleanUrl(url) {
  return url.replace(/[),.;]+$/, '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
