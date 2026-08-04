import { listSessions } from '../session/ledger.js';

export async function sessionsCommand(workspacePath, { json = false, limit = 10 } = {}) {
  const sessions = (await listSessions(workspacePath)).slice(0, limit);
  if (json) {
    process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
    return sessions;
  }
  if (sessions.length === 0) {
    process.stdout.write('No 64less sessions found.\n');
    return sessions;
  }
  for (const item of sessions) {
    const size = item.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
    process.stdout.write(`${item.name}  ${item.status}  artifacts=${item.artifacts.length} bytes=${size}\n`);
  }
  return sessions;
}
