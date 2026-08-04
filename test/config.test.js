import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, mergeConfig } from '../src/config.js';

test('deep-merges the stable config sections', () => {
  const result = mergeConfig(DEFAULT_CONFIG, {
    env: { MODE: 'test' },
    windows: { driveMappings: { 'D:\\Game': '/srv/game' } },
    qa: { fps: 60 },
  });
  assert.equal(result.env.MODE, 'test');
  assert.equal(result.windows.driveMappings['D:\\Game'], '/srv/game');
  assert.equal(result.qa.fps, 60);
  assert.equal(result.qa.record, true);
});

test('deep-merges executor settings without enabling them implicitly', () => {
  const result = mergeConfig(DEFAULT_CONFIG, { executors: { powershellCore: { command: '/opt/pwsh' } } });
  assert.equal(result.executors.powershellCore.command, '/opt/pwsh');
  assert.equal(result.executors.powershellCore.enabled, false);
});
