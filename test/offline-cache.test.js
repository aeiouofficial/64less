import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForExit } from '../src/lib/process.js';
import { indexOfflinePackageDirectory, matchOfflinePackages } from '../src/dependencies/offline-cache.js';

test('indexes local tgz packages with hashes and matches exact name/version only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-cache-'));
  const packageDir = path.join(root, 'package');
  await fs.mkdir(packageDir);
  await fs.writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@fixture/linux-x64', version: '1.2.3', os: ['linux'], cpu: ['x64'] }));
  const archive = path.join(root, 'fixture.tgz');
  const tar = spawn('tar', ['-czf', archive, '-C', root, 'package'], { stdio: 'ignore' });
  assert.equal((await waitForExit(tar)).code, 0);
  try {
    const index = await indexOfflinePackageDirectory(root);
    assert.equal(index.archives.length, 1);
    assert.match(index.archives[0].sha256, /^[a-f0-9]{64}$/);
    const coverage = matchOfflinePackages([
      { name: '@fixture/linux-x64', version: '1.2.3' },
      { name: '@fixture/linux-x64', version: '9.9.9' },
    ], index, { platform: 'linux', arch: 'x64', libc: 'glibc' });
    assert.equal(coverage.matched.length, 1);
    assert.equal(coverage.unmatched.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
