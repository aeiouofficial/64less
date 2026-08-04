import { loadLiveSession, runPhysicalInput } from '../qa/live-session.js';

export async function inputCommand(workspacePath, action, args) {
  if (!action) throw new Error('Input action required: move, click, key, or type');
  const { live } = await loadLiveSession(workspacePath);
  await runPhysicalInput(live, action, args);
}
