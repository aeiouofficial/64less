import { spawn } from 'node:child_process';

export function spawnLogged(command, args, options = {}) {
  return spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

export function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

export async function commandExists(command) {
  const child = spawn('sh', ['-lc', `command -v -- ${shellQuote(command)}`], {
    stdio: 'ignore',
  });
  const result = await waitForExit(child);
  return result.code === 0;
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export async function terminate(child, signal = 'SIGTERM', graceMs = 3000) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill(signal);
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => setTimeout(resolve, graceMs)),
  ]);
  if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
}


export async function terminateTree(child, signal = 'SIGTERM', graceMs = 3000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (!child.pid) return terminate(child, signal, graceMs);

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }

  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => setTimeout(resolve, graceMs)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}
