import { inspectPowerShellCoreExecutor } from './powershell-core.js';

export async function inspectExecutors(config = {}) {
  const powershellCore = await inspectPowerShellCoreExecutor(config);
  return { [powershellCore.id]: powershellCore };
}
