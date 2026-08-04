import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForExit } from '../src/lib/process.js';
import { indexOfflinePackageDirectory, matchOfflinePackages, repairFromOfflinePackages } from '../src/dependencies/offline-cache.js';

async function makeArchive(root, pkg) {
  const packageDir = path.join(root, 'package');
  await fs.rm(packageDir, { recursive: true, force: true });
  await fs.mkdir(packageDir);
  await fs.writeFile(path.join(packageDir, 'package.json'), JSON.stringify(pkg));
  await fs.writeFile(path.join(packageDir, 'payload.txt'), pkg.name);
  const archive = path.join(root, `${pkg.name.replace(/[^a-z0-9]/gi, '-')}-${pkg.version}.tgz`);
  const tar = spawn('tar', ['-czf', archive, '-C', root, 'package'], { stdio: 'ignore' });
  assert.equal((await waitForExit(tar)).code, 0);
  return archive;
}

test('repairs only exact safe offline packages and leaves manifests untouched', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-repair-'));
  const cache = path.join(root, 'cache');
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(cache);
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"fixture"}\n');
  await makeArchive(cache, { name: '@fixture/linux-x64', version: '1.2.3', os: ['linux'], cpu: ['x64'] });
  try {
    const index = await indexOfflinePackageDirectory(cache);
    const missing = [{ name: '@fixture/linux-x64', version: '1.2.3', location: 'node_modules/@fixture/linux-x64' }];
    const coverage = matchOfflinePackages(missing, index, { platform: 'linux', arch: 'x64', libc: 'glibc' });
    const result = await repairFromOfflinePackages(workspace, coverage.matched);
    assert.equal(result.installed.length, 1);
    assert.equal(await fs.readFile(path.join(workspace, 'node_modules/@fixture/linux-x64/payload.txt'), 'utf8'), '@fixture/linux-x64');
    assert.equal(await fs.readFile(path.join(workspace, 'package.json'), 'utf8'), '{"name":"fixture"}\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('does not auto-extract packages with install lifecycle scripts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-repair-script-'));
  const cache = path.join(root, 'cache');
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(cache);
  await fs.mkdir(workspace);
  await makeArchive(cache, { name: 'needs-install', version: '1.0.0', scripts: { install: 'node install.js' } });
  try {
    const index = await indexOfflinePackageDirectory(cache);
    const coverage = matchOfflinePackages([{ name: 'needs-install', version: '1.0.0', location: 'node_modules/needs-install' }], index, { platform: 'linux', arch: 'x64', libc: 'glibc' });
    const result = await repairFromOfflinePackages(workspace, coverage.matched);
    assert.equal(result.installed.length, 0);
    assert.equal(result.skipped[0].reason, 'install-scripts');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
