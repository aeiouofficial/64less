import { spawn } from 'node:child_process';
import { terminate, waitForExit } from '../lib/process.js';

export async function startDisplay(config) {
  if (process.env.DISPLAY && await displayWorks(process.env.DISPLAY)) {
    return { display: process.env.DISPLAY, owned: false, processes: [] };
  }

  const display = config.display;
  const [width, height] = config.size.split('x').map(Number);
  if (!width || !height) throw new Error(`Invalid qa.size: ${config.size}`);

  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${width}x${height}x24`, '-nolisten', 'tcp'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await delay(350);
  if (xvfb.exitCode !== null) throw new Error('Xvfb exited during startup');

  const openbox = spawn('openbox', [], {
    env: { ...process.env, DISPLAY: display, TERM: process.env.TERM ?? 'xterm' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await delay(200);

  return { display, owned: true, processes: [openbox, xvfb] };
}

export async function stopDisplay(displayState) {
  if (!displayState?.owned) return;
  for (const child of displayState.processes) await terminate(child);
}

async function displayWorks(display) {
  const probe = spawn('xdpyinfo', ['-display', display], { stdio: 'ignore' });
  try {
    const result = await waitForExit(probe);
    return result.code === 0;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
