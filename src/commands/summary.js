import path from 'node:path';
import { listSessions, sessionsRoot, summarizeSession } from '../session/ledger.js';

export async function summaryCommand(workspacePath, sessionName = null, { json = false } = {}) {
  let summary;
  if (sessionName) summary = await summarizeSession(path.join(sessionsRoot(workspacePath), path.basename(sessionName)));
  else {
    const sessions = await listSessions(workspacePath);
    if (sessions.length === 0) throw new Error('No 64less sessions found');
    [summary] = sessions;
  }
  if (json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else {
    process.stdout.write(`session: ${summary.name}\nstatus: ${summary.status}\n`);
    process.stdout.write(`created: ${summary.createdAt ?? 'unknown'}\nended: ${summary.endedAt ?? 'unknown'}\n`);
    process.stdout.write(`browser restarts: ${summary.browserRestarts}\n`);
    if (summary.telemetry) {
      process.stdout.write(`telemetry samples: ${summary.telemetry.samples}\n`);
      for (const [name, bytes] of Object.entries(summary.telemetry.peakRssBytes ?? {})) {
        process.stdout.write(`peak RSS ${name}: ${bytes} bytes\n`);
      }
      if (summary.telemetry.browserFps) process.stdout.write(`browser FPS avg/min/max: ${summary.telemetry.browserFps.average}/${summary.telemetry.browserFps.minimum}/${summary.telemetry.browserFps.maximum}\n`);
    }
    for (const artifact of summary.artifacts) process.stdout.write(`  ${artifact.name}: ${artifact.bytes} bytes\n`);
  }
  return summary;
}
