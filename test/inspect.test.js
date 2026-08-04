import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWorkspace } from '../src/workspace/inspect.js';

test('reports Windows-oriented workspace assumptions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-test-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    scripts: { dev: 'cmd /c set PORT=5173 && npm.cmd run serve', serve: 'vite' },
    optionalDependencies: { '@esbuild/win32-x64': '1.0.0' },
  }));
  await fs.writeFile(path.join(root, 'RUN.cmd'), '@echo off\n');
  const result = await inspectWorkspace(root);
  assert.equal(result.package.name, 'fixture');
  assert.equal(result.packageManager, 'npm');
  assert.equal(result.suggestedScript, 'dev');
  assert.ok(result.windows.score >= 4);
  assert.deepEqual(result.launchers, ['RUN.cmd']);
});
