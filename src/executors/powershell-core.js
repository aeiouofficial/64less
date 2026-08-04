import { commandExists } from '../lib/process.js';

export const POWERSHELL_CORE_EXECUTOR_ID = 'powershell-core';

export function inspectPowerShellInvocation(segment, config = {}) {
  const match = String(segment).trim().match(/^(powershell(?:\.exe)?|pwsh(?:\.exe)?)\s+([\s\S]+)$/i);
  if (!match) return null;

  const args = match[2].trim();
  if (!isSupportedFileInvocation(args)) {
    return {
      supported: false,
      reason: 'powershell-invocation-not-file-scoped',
      executable: match[1],
    };
  }

  const executor = config.powershellCore ?? {};
  const command = executor.command ?? 'pwsh';
  return {
    supported: true,
    executable: match[1],
    args,
    requirement: {
      id: POWERSHELL_CORE_EXECUTOR_ID,
      capability: 'powershell-script',
      configured: executor.enabled === true,
      command,
    },
    command: executor.enabled === true ? `${command} ${args}` : String(segment).trim(),
  };
}

export async function inspectPowerShellCoreExecutor(config = {}) {
  const executor = config.powershellCore ?? {};
  const command = executor.command ?? 'pwsh';
  return {
    id: POWERSHELL_CORE_EXECUTOR_ID,
    capability: 'powershell-script',
    configured: executor.enabled === true,
    command,
    available: await commandExists(command),
  };
}

function isSupportedFileInvocation(args) {
  // Keep this intentionally narrow. Inline -Command content can contain arbitrary
  // Windows-only semantics and should not become an implicit compatibility layer.
  return /(?:^|\s)-File(?:\s|$)/i.test(args)
    && !/(?:^|\s)-(?:Command|EncodedCommand|ConfigurationName)(?:\s|$)/i.test(args);
}
