import { splitCommandChain, joinCommandChain } from './command-chain.js';
import { translateWindowsPaths } from './paths.js';
import { shellQuote } from '../lib/process.js';
import { inspectPowerShellInvocation } from '../executors/powershell-core.js';

const UNSUPPORTED = [
  ['batch-control-flow', /\b(?:if\s+errorlevel|goto|call\s+:[A-Za-z0-9_-]+)\b/i],
  ['batch-script-location', /%~dp0/i],
  ['registry', /\breg(?:\.exe)?\s+(?:add|delete|query)\b/i],
  ['windows-service', /\b(?:sc(?:\.exe)?|net(?:\.exe)?)\s+(?:start|stop|use)\b/i],
  ['start-command', /(?:^|\s)start(?:\s+"[^"]*")?\s+/i],
  ['cmd-caret-escape', /\^./],
];

export function translateCommand(input, options = {}) {
  const changes = [];
  const executorRequirements = [];
  const segmentUnsupported = [];
  let command = String(input).trim();

  command = stripCmdWrapper(command, changes);
  const chain = splitCommandChain(command);
  if (chain.error) {
    return {
      original: input,
      command,
      changes,
      executorRequirements,
      unsupported: [chain.error],
    };
  }

  const translatedParts = chain.parts.map((part) => ({
    ...part,
    command: translateSegment(part.command, options, changes, executorRequirements, segmentUnsupported),
  }));

  command = joinCommandChain(translatedParts);
  const unsupported = [...segmentUnsupported, ...detectUnsupported(command)];
  const unresolvedDrivePaths = command.match(/\b[A-Za-z]:\\[^\s"']*/g) ?? [];
  if (unresolvedDrivePaths.length > 0) unsupported.push('unmapped-drive-path');

  return {
    original: input,
    command,
    changes,
    executorRequirements: dedupeExecutorRequirements(executorRequirements),
    unsupported: [...new Set(unsupported)],
  };
}

function translateSegment(segment, options, changes, executorRequirements, segmentUnsupported) {
  const assignment = parseSetAssignment(segment);
  if (assignment) {
    changes.push({ kind: 'windows-env', from: segment, to: `${assignment.name}=...` });
    return `export ${assignment.name}=${shellQuote(assignment.value)}`;
  }

  let command = segment;
  const powershell = inspectPowerShellInvocation(command, options.executors ?? {});
  if (powershell) {
    if (!powershell.supported) {
      segmentUnsupported.push(powershell.reason);
      return command;
    }
    executorRequirements.push(powershell.requirement);
    if (powershell.requirement.configured) {
      changes.push({ kind: 'executor', executor: powershell.requirement.id, capability: powershell.requirement.capability });
      command = powershell.command;
    }
  }

  command = replace(command, /\bnpm\.cmd\b/gi, 'npm', 'npm.cmd', changes);
  command = replace(command, /\bnpx\.cmd\b/gi, 'npx', 'npx.cmd', changes);
  command = replace(command, /\bnode\.exe\b/gi, 'node', 'node.exe', changes);

  command = command.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name) => {
    const replacement = name.toUpperCase() === 'CD' ? '${PWD}' : `\${${name}}`;
    changes.push({ kind: 'percent-env', from: match, to: replacement });
    return replacement;
  });

  const pathResult = translateWindowsPaths(command, options.driveMappings ?? {});
  command = pathResult.command;
  for (const item of pathResult.applied) changes.push({ kind: 'path', ...item });

  const builtin = translateSimpleBuiltin(command);
  if (builtin) {
    changes.push({ kind: builtin.kind, from: command, to: builtin.command });
    command = builtin.command;
  }

  return command.trim();
}

function stripCmdWrapper(command, changes) {
  const match = command.match(/^cmd(?:\.exe)?\s+\/(?:c|s|k)\s+/i);
  if (!match) return command;
  changes.push({ kind: 'cmd-wrapper', from: match[0].trim(), to: '' });
  return command.slice(match[0].length).trim();
}

function parseSetAssignment(segment) {
  const quoted = segment.match(/^set\s+"([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)"$/i);
  if (quoted) return { name: quoted[1], value: quoted[2] };
  const plain = segment.match(/^set\s+([A-Za-z_][A-Za-z0-9_]*)=([^&|<>]*)$/i);
  if (plain) return { name: plain[1], value: plain[2].trimEnd() };
  return null;
}

function translateSimpleBuiltin(command) {
  const where = command.match(/^where(?:\.exe)?\s+([A-Za-z0-9_.-]+)$/i);
  if (where) return { kind: 'where-command', command: `command -v -- ${shellQuote(where[1])}` };

  const copy = parseTwoPathBuiltin(command, 'copy');
  if (copy) return { kind: 'copy-command', command: `cp -- ${shellQuote(copy.source)} ${shellQuote(copy.destination)}` };

  const move = parseTwoPathBuiltin(command, 'move');
  if (move) return { kind: 'move-command', command: `mv -- ${shellQuote(move.source)} ${shellQuote(move.destination)}` };

  const del = parseDeleteBuiltin(command);
  if (del) return { kind: 'delete-command', command: `rm -f -- ${shellQuote(del.path)}` };

  return null;
}

function parseTwoPathBuiltin(command, name) {
  const prefix = new RegExp(`^${name}(?:\\.exe)?\\s+`, 'i');
  if (!prefix.test(command)) return null;
  let rest = command.replace(prefix, '').trim();
  rest = rest.replace(/^\/y\s+/i, '');
  if (/^\/-y\b/i.test(rest)) return null;
  const args = parseSimpleArguments(rest);
  if (!args || args.length !== 2 || args.some(hasUnsafeGlob)) return null;
  return { source: args[0], destination: args[1] };
}

function parseDeleteBuiltin(command) {
  if (!/^del(?:\.exe)?\s+/i.test(command)) return null;
  let rest = command.replace(/^del(?:\.exe)?\s+/i, '').trim();
  while (/^\/(?:f|q)\s+/i.test(rest)) rest = rest.replace(/^\/(?:f|q)\s+/i, '');
  const args = parseSimpleArguments(rest);
  if (!args || args.length !== 1 || hasUnsafeGlob(args[0])) return null;
  return { path: args[0] };
}

function parseSimpleArguments(input) {
  const args = [];
  let current = '';
  let quote = null;

  const push = () => {
    if (!current) return;
    args.push(current);
    current = '';
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      continue;
    }
    if ('&|<>();'.includes(char)) return null;
    current += char;
  }

  if (quote) return null;
  push();
  return args;
}

function hasUnsafeGlob(value) {
  return /[*?\[]/.test(value);
}

function dedupeExecutorRequirements(requirements) {
  const seen = new Set();
  return requirements.filter((item) => {
    const key = `${item.id}:${item.capability}:${item.command}:${item.configured}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectUnsupported(command) {
  return UNSUPPORTED
    .filter(([, pattern]) => pattern.test(command))
    .map(([kind]) => kind);
}

function replace(input, pattern, replacement, kind, changes) {
  if (!pattern.test(input)) return input;
  changes.push({ kind });
  return input.replace(pattern, replacement);
}
