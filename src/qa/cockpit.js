import path from 'node:path';
import { spawn } from 'node:child_process';
import { shellQuote } from '../lib/process.js';

export function startCockpit({ display, size, sessionDir }) {
  const [width, height] = size.split('x').map(Number);
  const panelWidth = 520;
  const columns = 68;
  const rows = Math.max(30, Math.floor(height / 17));
  const workspaceLog = path.join(sessionDir, 'workspace.log');
  const browserLog = path.join(sessionDir, 'browser.log');
  const command = `printf '\\033[1;36m64less live logs\\033[0m\\n'; touch ${shellQuote(browserLog)}; tail -n 50 -F ${shellQuote(workspaceLog)} ${shellQuote(browserLog)}`;

  return spawn('xterm', [
    '-title', '64less logs',
    '-geometry', `${columns}x${rows}+${Math.max(0, width - panelWidth)}+0`,
    '-fa', 'Monospace',
    '-fs', '9',
    '-e', 'bash', '-lc', command,
  ], {
    env: { ...process.env, DISPLAY: display },
    stdio: 'ignore',
    detached: true,
  });
}
