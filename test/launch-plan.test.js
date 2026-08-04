import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchPlan } from '../src/workspace/launch-plan.js';

const config = { windows: { driveMappings: {} } };

test('plans the actual npm lifecycle scripts rather than only the npm wrapper', () => {
  const workspace = {
    suggestedScript: 'dev',
    packageManager: 'npm',
    scripts: {
      predev: 'set "MODE=qa"',
      dev: 'cmd.exe /c npm.cmd run serve',
      serve: 'vite',
    },
  };
  const plan = buildLaunchPlan({ workspace, config, scriptName: 'dev' });
  assert.equal(plan.compatibility, 'Adapted');
  assert.equal(plan.needsAdapterShell, true);
  assert.match(plan.launchCommand, /^npm run /);
  assert.deepEqual(plan.lifecycle.map((item) => item.name), ['predev', 'dev', 'serve']);
  assert.equal(plan.lifecycle[0].command, "export MODE='qa'");
  assert.equal(plan.lifecycle[1].command, 'npm run serve');
});

test('refuses adapted package scripts for package managers without a script-shell adapter', () => {
  const workspace = {
    suggestedScript: 'dev',
    packageManager: 'pnpm',
    scripts: { dev: 'cmd.exe /c node.exe server.js' },
  };
  const plan = buildLaunchPlan({ workspace, config, scriptName: 'dev' });
  assert.equal(plan.compatibility, 'Unsupported');
  assert.ok(plan.unsupported.includes('adapted-script-shell-not-implemented:pnpm'));
});

test('recursively inspects npm scripts reached from lifecycle scripts', () => {
  const workspace = {
    suggestedScript: 'dev',
    packageManager: 'npm',
    scripts: {
      predev: 'npm run setup',
      dev: 'node server.js',
      setup: 'cmd.exe /c set "READY=1" && node.exe setup.js',
    },
  };
  const plan = buildLaunchPlan({ workspace, config, scriptName: 'dev' });
  assert.equal(plan.compatibility, 'Adapted');
  assert.ok(plan.lifecycle.some((item) => item.name === 'setup'));
  assert.ok(plan.changes.some((change) => change.script === 'setup' && change.kind === 'cmd-wrapper'));
});

test('treats an exact explicit npm run command as a package-script plan', () => {
  const workspace = {
    suggestedScript: 'dev',
    packageManager: 'npm',
    scripts: { dev: 'cmd.exe /c node.exe server.js' },
  };
  const plan = buildLaunchPlan({ workspace, config, explicitCommand: 'npm run dev' });
  assert.equal(plan.kind, 'package-script');
  assert.equal(plan.script, 'dev');
  assert.equal(plan.compatibility, 'Adapted');
});
