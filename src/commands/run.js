import { loadConfig } from '../config.js';
import { runSession } from '../session/session.js';
import { inspectWorkspace } from '../workspace/inspect.js';
import { buildLaunchPlan } from '../workspace/launch-plan.js';

export async function runCommand(workspacePath, options = {}) {
  const workspace = await inspectWorkspace(workspacePath);
  const config = await loadConfig(workspace.root, options.configPath);
  const scriptName = options.script ?? workspace.suggestedScript;
  const explicitCommand = options.command ?? config.command ?? null;
  if (!explicitCommand && !scriptName) {
    throw new Error('No launch command found. Set command in 64less.config.json or pass --command.');
  }

  const launchPlan = buildLaunchPlan({ workspace, config, scriptName, explicitCommand });
  return runSession({
    workspace,
    config,
    launchPlan,
    qa: Boolean(options.qa),
    force: Boolean(options.force),
  });
}
