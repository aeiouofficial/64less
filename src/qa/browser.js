import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveBrowserIdentity } from '../runtime/identity.js';

export async function startChromium({ url, display, sessionDir, config }) {
  const executable = config.chromium ?? 'chromium';
  const logPath = path.join(sessionDir, 'chromium.log');
  const log = fs.createWriteStream(logPath, { flags: 'a' });
  const profilePath = path.join(sessionDir, 'chromium-profile');
  const netlogPath = path.join(sessionDir, 'chromium-netlog.json');
  const [width, height] = config.size.split('x').map(Number);
  const browserWidth = config.cockpit ? Math.max(960, width - 520) : width;
  const identity = resolveBrowserIdentity(config.browserUser ?? null);

  await fsPromises.mkdir(profilePath, { recursive: true });
  if (identity) await fsPromises.chown(profilePath, identity.uid, identity.gid);

  const args = [
    `--user-data-dir=${profilePath}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${config.remoteDebuggingPort}`,
    ...(config.netlog ? [`--log-net-log=${netlogPath}`, '--net-log-capture-mode=Default'] : []),
    '--enable-logging=stderr',
    '--log-level=0',
    '--auto-open-devtools-for-tabs',
    '--no-first-run',
    '--no-default-browser-check',
    '--ozone-platform=x11',
    '--window-position=0,0',
    `--window-size=${browserWidth},${height}`,
    ...(config.extraChromiumArgs ?? []),
    url,
  ];

  const child = spawn(executable, args, {
    env: {
      ...process.env,
      DISPLAY: display,
      ...(identity ? {
        HOME: identity.home,
        USER: identity.name,
        LOGNAME: identity.name,
      } : {}),
    },
    ...(identity ? { uid: identity.uid, gid: identity.gid } : {}),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.once('exit', () => log.end());
  return { child, identity };
}
