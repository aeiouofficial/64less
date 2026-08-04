#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { translateCommand } from '../src/adapters/shell.js';

const { command, extra } = parseShellInvocation(process.argv.slice(2));
const driveMappings = parseJsonEnvironment('SIXTYFOURLESS_DRIVE_MAPPINGS', {});
const force = process.env.SIXTYFOURLESS_FORCE === '1';
const executors = parseJsonEnvironment('SIXTYFOURLESS_EXECUTORS', {});
const translation = translateCommand(command, { driveMappings, executors });

await appendAudit({
  at: new Date().toISOString(),
  cwd: process.cwd(),
  ...translation,
});

const unconfiguredExecutors = (translation.executorRequirements ?? []).filter((item) => !item.configured);
if (unconfiguredExecutors.length > 0 && !force) {
  process.stderr.write(`64less script-shell: required executor is not enabled: ${unconfiguredExecutors.map((item) => item.id).join(', ')}\n`);
  process.exit(65);
}

if (translation.unsupported.length > 0 && !force) {
  process.stderr.write(`64less script-shell: unsupported Windows assumptions: ${translation.unsupported.join(', ')}\n`);
  process.exit(64);
}

const child = spawn('bash', ['-c', translation.command, ...extra], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

child.once('error', (error) => {
  process.stderr.write(`64less script-shell: ${error.message}\n`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

function parseShellInvocation(args) {
  const cIndex = args.indexOf('-c');
  if (cIndex === -1 || args[cIndex + 1] === undefined) {
    throw new Error('expected shell invocation: -c <command>');
  }
  return { command: args[cIndex + 1], extra: args.slice(cIndex + 2) };
}

function parseJsonEnvironment(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
}

async function appendAudit(record) {
  const auditPath = process.env.SIXTYFOURLESS_SCRIPT_AUDIT;
  if (!auditPath) return;
  await fs.appendFile(auditPath, `${JSON.stringify(record)}\n`);
}
