import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const roots = ['bin', 'src', 'scripts', 'test'];
const files = [];
for (const root of roots) await collect(root);
for (const file of files) {
  const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  if (code !== 0) process.exit(code ?? 1);
}
process.stdout.write(`Checked ${files.length} JavaScript files.\n`);

async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(file);
  }
}
