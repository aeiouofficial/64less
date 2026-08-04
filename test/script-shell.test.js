import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForExit } from '../src/lib/process.js';

test('npm script-shell adapter executes an adapted command and writes its audit trail', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '64less-shell-'));
  const audit = path.join(root, 'audit.ndjson');
  const output = path.join(root, 'out.txt');
  const command = `set "VALUE=adapted" && node -e "require('fs').writeFileSync('${output}', process.env.VALUE)"`;
  const child = spawn(process.execPath, ['bin/64less-script-shell.js', '-c', command], {
    cwd: process.cwd(),
    env: { ...process.env, SIXTYFOURLESS_SCRIPT_AUDIT: audit },
    stdio: 'ignore',
  });
  try {
    const result = await waitForExit(child);
    assert.equal(result.code, 0);
    assert.equal(await fs.readFile(output, 'utf8'), 'adapted');
    const record = JSON.parse((await fs.readFile(audit, 'utf8')).trim());
    assert.equal(record.unsupported.length, 0);
    assert.ok(record.changes.some((change) => change.kind === 'windows-env'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
