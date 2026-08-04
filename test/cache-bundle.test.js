import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForExit } from '../src/lib/process.js';
import { exportOfflineCache, importOfflineCache, loadOfflineCacheBundle } from '../src/dependencies/cache-bundle.js';

async function makeArchive(root, name, version) {
  const packageDir = path.join(root, 'package');
  await fs.rm(packageDir, { recursive: true, force: true });
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name, version, os: ['linux'], cpu: ['x64'], libc: ['glibc'] }));
  const archive = path.join(root, `${name.replace(/[^a-z0-9]/gi, '-')}.tgz`);
  const child = spawn('tar', ['-czf', archive, '-C', root, 'package'], { stdio: 'ignore' });
  assert.equal((await waitForExit(child)).code, 0);
}

test('exports and imports a hash-verified portable offline cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-cache-bundle-'));
  const raw = path.join(root, 'raw');
  const exported = path.join(root, 'exported');
  const imported = path.join(root, 'imported');
  await fs.mkdir(raw);
  await makeArchive(raw, '@fixture/native', '2.0.0');
  try {
    const out = await exportOfflineCache(raw, exported);
    assert.equal(out.verified, true);
    assert.equal(out.archives.length, 1);
    assert.ok(!JSON.stringify(out.manifest).includes(root));

    const copy = await importOfflineCache(exported, imported);
    assert.equal(copy.verified, true);
    assert.equal(copy.archives[0].name, '@fixture/native');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects a tampered portable offline cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-cache-tamper-'));
  const raw = path.join(root, 'raw');
  const exported = path.join(root, 'exported');
  await fs.mkdir(raw);
  await makeArchive(raw, 'fixture', '1.0.0');
  try {
    const out = await exportOfflineCache(raw, exported);
    await fs.appendFile(out.archives[0].file, 'tamper');
    await assert.rejects(() => loadOfflineCacheBundle(exported), /hash mismatch/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
