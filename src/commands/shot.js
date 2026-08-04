import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathExists, readJson } from '../lib/fs.js';
import { waitForExit } from '../lib/process.js';

export async function shotCommand(workspacePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const livePath = path.join(workspaceRoot, '.64less', 'current-session.json');
  if (!(await pathExists(livePath))) throw new Error('No live 64less QA session found for this workspace');
  const live = await readJson(livePath);
  const output = path.join(live.sessionDir, `screenshot-${Date.now()}.png`);
  const child = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'x11grab',
    '-video_size', live.size,
    '-i', `${live.display}.0`,
    '-frames:v', '1',
    '-y', output,
  ], { stdio: 'ignore' });
  const result = await waitForExit(child);
  if (result.code !== 0) throw new Error(`Screenshot capture failed with exit code ${result.code}`);
  process.stdout.write(`${output}\n`);
  return output;
}
