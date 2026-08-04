import { loadConfig } from '../config.js';
import { inspectWorkspace } from '../workspace/inspect.js';
import { buildLaunchPlan } from '../workspace/launch-plan.js';

export async function planCommand(workspacePath, scriptName = null, { json = false, configPath = null, command = null } = {}) {
  const workspace = await inspectWorkspace(workspacePath);
  const config = await loadConfig(workspace.root, configPath);
  const report = buildLaunchPlan({
    workspace,
    config,
    scriptName,
    explicitCommand: command ?? config.command,
  });

  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(`kind: ${report.kind}\n`);
    if (report.script) process.stdout.write(`script: ${report.script}\n`);
    process.stdout.write(`launch: ${report.launchCommand}\n`);
    process.stdout.write(`compatibility: ${report.compatibility}\n`);
    process.stdout.write(`changes: ${report.changes.length}\n`);
    process.stdout.write(`executors: ${(report.executorRequirements ?? []).length ? report.executorRequirements.map((item) => `${item.id}:${item.capability}${item.configured ? ':enabled' : ':disabled'}`).join(', ') : 'none'}\n`);
    process.stdout.write(`unsupported: ${report.unsupported.length ? report.unsupported.join(', ') : 'none'}\n`);
    for (const item of report.lifecycle) {
      if (report.kind !== 'package-script' && item.name === 'direct') continue;
      process.stdout.write(`  ${item.name}: ${item.command}\n`);
    }
  }
  return report;
}
