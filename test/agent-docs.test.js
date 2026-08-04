import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const required = [
  'AGENTS.md',
  'docs/CURRENT_HANDOFF.md',
  'docs/AGENT_QUICKSTART.md',
  'docs/EXTENDING_64LESS.md',
  'docs/SELF_UPDATE_PROTOCOL.md',
  'docs/RELEASE_AND_HANDOFF.md',
];

test('release tree remains self-describing for a stateless coding agent', async () => {
  for (const file of required) {
    const text = await fs.readFile(file, 'utf8');
    assert.ok(text.length > 300, `${file} is unexpectedly small`);
  }
});

test('canonical agent instructions preserve critical compatibility invariants', async () => {
  const text = await fs.readFile('AGENTS.md', 'utf8');
  assert.match(text, /Never spoof `process\.platform`/);
  assert.match(text, /Physical QA means OS-level input/);
  assert.match(text, /hidden downloads/);
});
