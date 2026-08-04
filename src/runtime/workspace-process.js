import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { buildWorkspaceEnvironment } from './environment.js';

export function startWorkspaceProcess({ workspaceRoot, command, env = {}, logPath }) {
  const log = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn('bash', ['-lc', command], {
    cwd: workspaceRoot,
    env: buildWorkspaceEnvironment(workspaceRoot, env),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const pipe = (stream, label) => {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const text = chunk.replace(/\r\n/g, '\n');
      process.stdout.write(text);
      for (const line of text.split('\n')) {
        if (line) log.write(`[${label}] ${line}\n`);
      }
    });
  };

  pipe(child.stdout, 'stdout');
  pipe(child.stderr, 'stderr');
  child.once('exit', (code, signal) => {
    log.write(`[64less] process exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    log.end();
  });
  return child;
}
