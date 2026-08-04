import { translateCommand } from '../adapters/shell.js';
import { shellQuote } from '../lib/process.js';

export function buildLaunchPlan({ workspace, config, scriptName = null, explicitCommand = null }) {
  const explicitScript = explicitCommand ? parseExactPackageRun(explicitCommand, workspace) : null;
  if (explicitCommand && !explicitScript) return buildDirectPlan(explicitCommand, config);

  const selected = explicitScript ?? scriptName ?? workspace.suggestedScript;
  if (!selected || !workspace.scripts[selected]) throw new Error('No runnable script selected');

  const reachable = collectReachableScripts(workspace.scripts, selected);
  const lifecycle = reachable.map((name) => ({
    name,
    ...translateCommand(workspace.scripts[name], { driveMappings: config.windows.driveMappings, executors: config.executors }),
  }));

  const changes = lifecycle.flatMap((item) => item.changes.map((change) => ({ script: item.name, ...change })));
  const unsupported = [...new Set(lifecycle.flatMap((item) => item.unsupported))];
  const executorRequirements = dedupeRequirements(lifecycle.flatMap((item) => item.executorRequirements ?? []));
  const needsAdapterShell = changes.length > 0;

  if (needsAdapterShell && workspace.packageManager !== 'npm') {
    unsupported.push(`adapted-script-shell-not-implemented:${workspace.packageManager}`);
  }

  return {
    kind: 'package-script',
    script: selected,
    packageManager: workspace.packageManager,
    launchCommand: `${workspace.packageManager} run ${shellQuote(selected)}`,
    compatibility: classifyCompatibility(changes, unsupported, executorRequirements),
    changes,
    unsupported: [...new Set(unsupported)],
    executorRequirements,
    lifecycle,
    needsAdapterShell,
  };
}

function buildDirectPlan(command, config) {
  const translation = translateCommand(command, { driveMappings: config.windows.driveMappings, executors: config.executors });
  return {
    kind: 'direct',
    script: null,
    packageManager: null,
    launchCommand: translation.command,
    compatibility: classifyCompatibility(translation.changes, translation.unsupported, translation.executorRequirements),
    changes: translation.changes,
    unsupported: translation.unsupported,
    executorRequirements: translation.executorRequirements ?? [],
    lifecycle: [{ name: 'direct', ...translation }],
    needsAdapterShell: false,
  };
}

function collectReachableScripts(scripts, selected) {
  const ordered = [];
  const queued = [];
  const seen = new Set();
  enqueueLifecycle(selected);

  while (queued.length > 0) {
    const name = queued.shift();
    if (seen.has(name) || !scripts[name]) continue;
    seen.add(name);
    ordered.push(name);
    for (const nested of findNpmRunTargets(scripts[name])) enqueueLifecycle(nested);
  }

  return ordered;

  function enqueueLifecycle(name) {
    for (const candidate of [`pre${name}`, name, `post${name}`]) {
      if (scripts[candidate] && !seen.has(candidate) && !queued.includes(candidate)) queued.push(candidate);
    }
  }
}

function findNpmRunTargets(command) {
  const output = [];
  const pattern = /\bnpm(?:\.cmd)?\s+(?:run|run-script)\s+([A-Za-z0-9:_-]+)/gi;
  let match;
  while ((match = pattern.exec(String(command)))) output.push(match[1]);
  return output;
}

function parseExactPackageRun(command, workspace) {
  if (workspace.packageManager !== 'npm') return null;
  const match = String(command).trim().match(/^npm(?:\.cmd)?\s+(?:run|run-script)\s+['"]?([A-Za-z0-9:_-]+)['"]?$/i);
  if (!match || !workspace.scripts[match[1]]) return null;
  return match[1];
}

function classifyCompatibility(changes, unsupported, executorRequirements = []) {
  if (unsupported.length > 0) return 'Unsupported';
  if (executorRequirements.length > 0) return 'Executor required';
  return changes.length > 0 ? 'Adapted' : 'Native';
}

function dedupeRequirements(requirements) {
  const seen = new Set();
  return requirements.filter((item) => {
    const key = `${item.id}:${item.capability}:${item.command}:${item.configured}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

