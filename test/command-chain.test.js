import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCommandChain } from '../src/adapters/command-chain.js';

test('splits top-level command chains without splitting quoted operators', () => {
  const result = splitCommandChain('set "VALUE=a&&b" && npm.cmd run dev || echo fail');
  assert.equal(result.error, null);
  assert.deepEqual(result.parts, [
    { command: 'set "VALUE=a&&b"', operator: '&&' },
    { command: 'npm.cmd run dev', operator: '||' },
    { command: 'echo fail', operator: null },
  ]);
});

test('refuses unbalanced quoting instead of guessing command boundaries', () => {
  const result = splitCommandChain('echo "unterminated && npm run dev');
  assert.equal(result.error, 'unbalanced-quote');
});
