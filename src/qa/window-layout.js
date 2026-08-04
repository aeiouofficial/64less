import { spawn } from 'node:child_process';
import { waitForExit } from '../lib/process.js';

export async function arrangeCockpit({ display, size }) {
  const [width, height] = size.split('x').map(Number);
  const panelWidth = 520;
  const windows = await listWindows(display);
  const browser = windows.find((item) => /Chromium$/i.test(item.title));
  const logs = windows.find((item) => item.title === '64less logs');

  if (browser) await placeWindow(display, browser.id, 0, 0, width - panelWidth, height);
  if (logs) await placeWindow(display, logs.id, width - panelWidth, 0, panelWidth, height);
  return { browser: Boolean(browser), logs: Boolean(logs) };
}

async function listWindows(display) {
  const child = spawn('wmctrl', ['-l'], {
    env: { ...process.env, DISPLAY: display },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  const result = await waitForExit(child);
  if (result.code !== 0) return [];
  return output.split('\n').filter(Boolean).map((line) => {
    const match = line.match(/^(0x[0-9a-f]+)\s+\S+\s+\S+\s+(.*)$/i);
    return match ? { id: match[1], title: match[2] } : null;
  }).filter(Boolean);
}

async function placeWindow(display, id, x, y, width, height) {
  const child = spawn('wmctrl', ['-i', '-r', id, '-b', 'remove,maximized_vert,maximized_horz'], {
    env: { ...process.env, DISPLAY: display },
    stdio: 'ignore',
  });
  await waitForExit(child);
  const move = spawn('wmctrl', ['-i', '-r', id, '-e', `0,${x},${y},${width},${height}`], {
    env: { ...process.env, DISPLAY: display },
    stdio: 'ignore',
  });
  await waitForExit(move);
}
