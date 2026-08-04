import test from 'node:test';
import assert from 'node:assert/strict';
import { translateCommand } from '../src/adapters/shell.js';
import { buildLaunchPlan } from '../src/workspace/launch-plan.js';
import { DEFAULT_CONFIG, mergeConfig } from '../src/config.js';

test('classifies a simple PowerShell file invocation as executor-scoped instead of translating it to bash', () => {
  const result = translateCommand('powershell.exe -NoProfile -File .\\scripts\\build.ps1');
  assert.equal(result.unsupported.length, 0);
  assert.equal(result.executorRequirements[0].id, 'powershell-core');
  assert.equal(result.executorRequirements[0].configured, false);
  assert.equal(result.command, 'powershell.exe -NoProfile -File ./scripts/build.ps1');
});

test('rewrites only a file-scoped PowerShell invocation when the executor is explicitly enabled', () => {
  const result = translateCommand('powershell.exe -NoProfile -File .\\scripts\\build.ps1', {
    executors: { powershellCore: { enabled: true, command: 'pwsh-custom' } },
  });
  assert.equal(result.command, 'pwsh-custom -NoProfile -File ./scripts/build.ps1');
  assert.ok(result.changes.some((change) => change.kind === 'executor'));
});

test('refuses inline PowerShell command semantics', () => {
  const result = translateCommand('powershell.exe -Command "Get-Item Env:PATH"', {
    executors: { powershellCore: { enabled: true } },
  });
  assert.ok(result.unsupported.includes('powershell-invocation-not-file-scoped'));
});

test('launch plan exposes Executor required as a distinct compatibility level', () => {
  const workspace = {
    packageManager: 'npm',
    scripts: { dev: 'powershell.exe -File .\\scripts\\dev.ps1' },
    suggestedScript: 'dev',
  };
  const plan = buildLaunchPlan({ workspace, config: mergeConfig(DEFAULT_CONFIG, {}), scriptName: 'dev' });
  assert.equal(plan.compatibility, 'Executor required');
  assert.equal(plan.executorRequirements[0].capability, 'powershell-script');
});
