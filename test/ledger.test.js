import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { processStartTicks, recoverStaleSession, validateCurrentMarker } from '../src/session/ledger.js';

test('binds a live session marker to the controller process birth identity', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-ledger-'));
  const sessionDir = path.join(root, '.64less', 'sessions', 'fixture');
  await fs.mkdir(sessionDir, { recursive: true });
  try {
    const ticks = await processStartTicks();
    const valid = await validateCurrentMarker(root, { pid: process.pid, controllerStartTicks: ticks, sessionDir });
    assert.equal(valid.live, true);
    const wrong = await validateCurrentMarker(root, { pid: process.pid, controllerStartTicks: 'wrong', sessionDir });
    assert.equal(wrong.live, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('recovers a stale marker without touching a live process', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-recover-'));
  const sessionDir = path.join(root, '.64less', 'sessions', 'fixture');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString() }));
  await fs.writeFile(path.join(root, '.64less', 'current-session.json'), JSON.stringify({
    pid: 99999999,
    controllerStartTicks: '1',
    sessionDir,
  }));
  try {
    const result = await recoverStaleSession(root);
    assert.equal(result.recovered, true);
    assert.equal(result.reason, 'stale-controller');
    const manifest = JSON.parse(await fs.readFile(path.join(sessionDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'recovered-after-controller-loss');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
