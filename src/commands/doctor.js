import { inspectTooling } from '../qa/tooling.js';
import { inspectManagedPolicy } from '../qa/chromium-policy.js';
import { inspectWorkspace } from '../workspace/inspect.js';
import { loadConfig } from '../config.js';
import { inspectExecutors } from '../executors/index.js';

export async function doctorCommand(workspacePath, { qa = true, json = false } = {}) {
  const workspace = await inspectWorkspace(workspacePath);
  const config = await loadConfig(workspace.root);
  const [tooling, chromiumPolicy, executors] = await Promise.all([
    inspectTooling({ qa }),
    inspectManagedPolicy(),
    inspectExecutors(config.executors ?? {}),
  ]);
  const report = {
    workspace: workspace.root,
    package: workspace.package,
    tooling,
    display: process.env.DISPLAY ?? null,
    chromiumPolicy,
    executors,
    qaReady: Boolean(tooling.node && tooling.bash && tooling.chromium && tooling.ffmpeg && (process.env.DISPLAY || tooling.Xvfb)),
  };
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    for (const [name, available] of Object.entries(tooling)) {
      process.stdout.write(`${available ? '✓' : '✗'} ${name}\n`);
    }
    process.stdout.write(`${report.qaReady ? '✓' : '✗'} full headed QA capability\n`);
    for (const executor of Object.values(executors)) {
      process.stdout.write(`${executor.available ? '✓' : '✗'} executor ${executor.id}${executor.configured ? ' (enabled)' : ' (disabled)'}\n`);
    }
    if (chromiumPolicy.blocksAllUrls && !chromiumPolicy.allowsLocalhost) {
      process.stdout.write(`${typeof process.geteuid === 'function' && process.geteuid() === 0 ? '✓' : '✗'} scoped Chromium localhost policy repair\n`);
    }
  }
  return report;
}
