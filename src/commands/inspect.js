import { inspectWorkspace } from '../workspace/inspect.js';

export async function inspectCommand(workspacePath, { json = false } = {}) {
  const result = await inspectWorkspace(workspacePath);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  process.stdout.write(`${result.package.name}${result.package.version ? `@${result.package.version}` : ''}\n`);
  process.stdout.write(`workspace: ${result.root}\n`);
  process.stdout.write(`package manager: ${result.packageManager}\n`);
  process.stdout.write(`suggested script: ${result.suggestedScript ?? 'none'}\n`);
  process.stdout.write(`Windows-orientation score: ${result.windows.score}\n`);
  process.stdout.write(`Windows launchers: ${result.launchers.length ? result.launchers.join(', ') : 'none'}\n`);
  process.stdout.write(`Windows-oriented scripts: ${result.windows.scriptFindings.length}\n`);
  process.stdout.write(`Win32 dependencies: ${result.windows.dependencyFindings.length}\n`);
  return result;
}
