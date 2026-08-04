import { recoverStaleSession } from '../session/ledger.js';

export async function recoverCommand(workspacePath, { json = false } = {}) {
  const result = await recoverStaleSession(workspacePath);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (!result.recovered) process.stdout.write('No stale 64less session to recover.\n');
  else process.stdout.write(`Recovered stale session: ${result.sessionDir ?? result.reason}${result.remuxed ? ' (MP4 remuxed)' : ''}\n`);
  return result;
}
