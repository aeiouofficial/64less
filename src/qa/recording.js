import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { terminate, waitForExit } from '../lib/process.js';

export async function startRecording({ display, size, fps, sessionDir }) {
  const mkvPath = path.join(sessionDir, 'session.mkv');
  const args = [
    '-hide_banner', '-loglevel', 'warning',
    '-f', 'x11grab',
    '-framerate', String(fps),
    '-video_size', size,
    '-draw_mouse', '1',
    '-i', `${display}.0`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-y', mkvPath,
  ];
  const child = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  const stderrPath = path.join(sessionDir, 'ffmpeg.log');
  const stderr = await fs.open(stderrPath, 'a');
  child.stderr.on('data', (chunk) => stderr.write(chunk));
  child.once('exit', () => stderr.close());
  await delay(250);
  if (child.exitCode !== null) throw new Error('FFmpeg recorder exited during startup');
  return { child, mkvPath };
}

export async function stopRecording(recording, sessionDir) {
  if (!recording) return null;
  if (recording.child.exitCode === null) recording.child.stdin.write('q\n');
  await Promise.race([waitForExit(recording.child), delay(4000)]);
  if (recording.child.exitCode === null) await terminate(recording.child, 'SIGINT');

  const mp4Path = path.join(sessionDir, 'session.mp4');
  const remux = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', recording.mkvPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    mp4Path,
  ], { stdio: 'ignore' });
  const result = await waitForExit(remux);
  return result.code === 0 ? mp4Path : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
