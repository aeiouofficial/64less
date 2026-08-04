import path from 'node:path';
import { clickCommand } from './commands/click.js';
import { depsCommand } from './commands/deps.js';
import { doctorCommand } from './commands/doctor.js';
import { inspectCommand } from './commands/inspect.js';
import { inputCommand } from './commands/input.js';
import { planCommand } from './commands/plan.js';
import { recoverCommand } from './commands/recover.js';
import { runCommand } from './commands/run.js';
import { sessionsCommand } from './commands/sessions.js';
import { shotCommand } from './commands/shot.js';
import { summaryCommand } from './commands/summary.js';
import { VERSION } from './version.js';

export async function main(argv) {
  const [command = 'help', ...rest] = argv;
  const parsed = parseArgs(rest);
  const workspace = path.resolve(parsed.positionals[0] ?? '.');

  switch (command) {
    case 'inspect':
      return inspectCommand(workspace, { json: parsed.flags.json });
    case 'doctor':
      return doctorCommand(workspace, { qa: true, json: parsed.flags.json });
    case 'deps':
      return depsCommand(workspace, {
        json: parsed.flags.json,
        cachePath: parsed.flags.cache,
        repair: parsed.flags.repair,
        exportCachePath: parsed.flags['export-cache'],
        importCachePath: parsed.flags['import-cache'],
        force: parsed.flags.force,
      });
    case 'plan':
      return planCommand(workspace, parsed.flags.script ?? parsed.positionals[1] ?? null, {
        json: parsed.flags.json,
        configPath: parsed.flags.config,
        command: parsed.flags.command,
      });
    case 'run':
      return runCommand(workspace, {
        qa: false,
        script: parsed.flags.script,
        command: parsed.flags.command,
        configPath: parsed.flags.config,
        force: parsed.flags.force,
      });
    case 'qa':
      return runCommand(workspace, {
        qa: true,
        script: parsed.flags.script,
        command: parsed.flags.command,
        configPath: parsed.flags.config,
        force: parsed.flags.force,
      });
    case 'sessions':
      return sessionsCommand(workspace, {
        json: parsed.flags.json,
        limit: parsed.flags.limit ? Number(parsed.flags.limit) : 10,
      });
    case 'summary':
      return summaryCommand(workspace, parsed.positionals[1] ?? null, { json: parsed.flags.json });
    case 'recover':
      return recoverCommand(workspace, { json: parsed.flags.json });
    case 'click':
      return clickCommand(workspace, parsed.positionals[1]);
    case 'input':
      return inputCommand(workspace, parsed.positionals[1], parsed.positionals.slice(2));
    case 'shot':
      return shotCommand(workspace);
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return null;
    case '--version':
    case '-v':
      process.stdout.write(`64less ${VERSION}\n`);
      return null;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function parseArgs(args) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inlineValue] = arg.slice(2).split('=', 2);
    if (['json', 'force', 'repair'].includes(name)) {
      flags[name] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    const value = inlineValue ?? args[++i];
    if (value === undefined) throw new Error(`Missing value for --${name}`);
    flags[name] = value;
  }
  return { positionals, flags };
}

function printHelp() {
  process.stdout.write(`64less — run Windows-first web workspaces natively on Linux\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  64less inspect  [workspace] [--json]\n`);
  process.stdout.write(`  64less doctor   [workspace] [--json]\n`);
  process.stdout.write(`  64less deps     [workspace] [--cache DIR] [--export-cache DIR] [--import-cache DIR] [--repair] [--force] [--json]\n`);
  process.stdout.write(`  64less plan     [workspace] [--script dev] [--command '...']\n`);
  process.stdout.write(`  64less run      [workspace] [--script dev] [--command '...']\n`);
  process.stdout.write(`  64less qa       [workspace] [--script dev] [--force]\n`);
  process.stdout.write(`  64less sessions [workspace] [--limit 10] [--json]\n`);
  process.stdout.write(`  64less summary  [workspace] [session-name] [--json]\n`);
  process.stdout.write(`  64less recover  [workspace] [--json]\n`);
  process.stdout.write(`  64less click    [workspace] 'CSS selector'\n`);
  process.stdout.write(`  64less input    [workspace] move X Y | click BUTTON | key KEYSYM | type TEXT\n`);
  process.stdout.write(`  64less shot     [workspace]\n`);
}
