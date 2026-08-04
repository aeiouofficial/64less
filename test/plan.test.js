import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planCommand } from '../src/commands/plan.js';

test('classifies an unchanged launch path as Native', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-plan-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    scripts: { dev: 'node server.mjs' },
  }));

  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const report = await planCommand(root, 'dev');
    assert.equal(report.compatibility, 'Native');
  } finally {
    process.stdout.write = write;
    await fs.rm(root, { recursive: true, force: true });
  }
});
