import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDependencies } from '../src/dependencies/inspect.js';

test('classifies lockfile platform entries from os/cpu metadata rather than package names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-deps-'));
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture' },
      'node_modules/not-windows-by-name': { version: '1.0.0', os: ['linux'], cpu: ['x64'] },
      'node_modules/@vendor/win32-looking-but-portable': { version: '1.0.0' },
      'node_modules/native-win': { version: '1.0.0', os: ['win32'], cpu: ['x64'], optional: true },
      'node_modules/required-darwin': { version: '1.0.0', os: ['darwin'] },
    },
  }));

  try {
    const report = await inspectDependencies(root, { platform: 'linux', arch: 'x64' });
    assert.equal(report.platformEntries.length, 3);
    assert.equal(report.incompatibleOptional.length, 1);
    assert.equal(report.incompatibleRequired.length, 1);
    assert.equal(report.incompatibleInstalled.length, 0);
    assert.equal(report.compatibleMissing.length, 1);
    assert.ok(!report.platformEntries.some((entry) => entry.name === '@vendor/win32-looking-but-portable'));
    assert.equal(report.installPlan.mutatesManifest, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('honors explicit libc metadata without inferring from package names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-libc-'));
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture' },
      'node_modules/native-explicit-gnu': { version: '1.0.0', os: ['linux'], cpu: ['x64'], libc: ['glibc'] },
      'node_modules/native-explicit-musl': { version: '1.0.0', os: ['linux'], cpu: ['x64'], libc: ['musl'], optional: true },
      'node_modules/name-says-musl-but-no-metadata': { version: '1.0.0' },
    },
  }));

  try {
    const report = await inspectDependencies(root, { platform: 'linux', arch: 'x64', libc: 'glibc' });
    assert.equal(report.platformEntries.length, 2);
    assert.equal(report.compatibleMissing.length, 1);
    assert.equal(report.compatibleMissing[0].name, 'native-explicit-gnu');
    assert.equal(report.incompatibleOptional[0].name, 'native-explicit-musl');
    assert.ok(!report.platformEntries.some((entry) => entry.name === 'name-says-musl-but-no-metadata'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
