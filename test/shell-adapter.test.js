import test from 'node:test';
import assert from 'node:assert/strict';
import { translateCommand } from '../src/adapters/shell.js';

test('translates common cmd/npm/env conventions without pretending to be Windows', () => {
  const result = translateCommand('cmd.exe /c set "PORT=5173" && npm.cmd run dev');
  assert.equal(result.command, "export PORT='5173' && npm run dev");
  assert.deepEqual(result.unsupported, []);
});

test('maps configured Windows drive prefixes', () => {
  const result = translateCommand('node D:\\work\\game\\scripts\\qa.js', {
    driveMappings: { 'D:\\work\\game': '/work/game' },
  });
  assert.equal(result.command, 'node /work/game/scripts/qa.js');
  assert.deepEqual(result.unsupported, []);
});

test('routes simple PowerShell file execution into the explicit executor boundary', () => {
  const result = translateCommand('powershell.exe -File .\\scripts\\boot.ps1');
  assert.equal(result.unsupported.length, 0);
  assert.equal(result.executorRequirements[0].id, 'powershell-core');
  assert.equal(result.executorRequirements[0].configured, false);
});

test('keeps quoted chain operators inside a Windows set value', () => {
  const result = translateCommand('cmd /c set "MESSAGE=a&&b" && echo "%MESSAGE%"');
  assert.equal(result.command, "export MESSAGE='a&&b' && echo \"${MESSAGE}\"");
  assert.deepEqual(result.unsupported, []);
});

test('translates only conservative simple file builtins', () => {
  assert.equal(translateCommand('copy /Y .\\a.txt .\\b.txt').command, "cp -- './a.txt' './b.txt'");
  assert.equal(translateCommand('move .\\a.txt .\\b.txt').command, "mv -- './a.txt' './b.txt'");
  assert.equal(translateCommand('del /q .\\a.txt').command, "rm -f -- './a.txt'");
  assert.equal(translateCommand('where node.exe').command, "command -v -- 'node'");
});
