import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTelemetry } from '../src/qa/telemetry.js';

test('summarizes resource peaks and sampled browser FPS', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-telemetry-'));
  const file = path.join(root, 'resources.ndjson');
  await fs.writeFile(file, [
    { at: '2026-01-01T00:00:00Z', host: { memoryAvailableBytes: 500 }, processGroups: { browser: { rssBytes: 100 } }, browser: { fps: 58 } },
    { at: '2026-01-01T00:00:02Z', host: { memoryAvailableBytes: 400 }, processGroups: { browser: { rssBytes: 180 }, workspace: { rssBytes: 90 } }, browser: { fps: 62 } },
  ].map((item) => JSON.stringify(item)).join('\n'));
  try {
    const summary = await summarizeTelemetry(file);
    assert.equal(summary.samples, 2);
    assert.equal(summary.peakRssBytes.browser, 180);
    assert.equal(summary.peakRssBytes.workspace, 90);
    assert.equal(summary.minHostAvailableBytes, 400);
    assert.equal(summary.browserFps.average, 60);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
