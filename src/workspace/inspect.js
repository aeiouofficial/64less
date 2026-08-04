import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists, readJson } from '../lib/fs.js';

const WINDOWS_PATTERNS = [
  ['cmd-wrapper', /\bcmd(?:\.exe)?\s+\/[csk]\b/i],
  ['windows-env', /(?:^|&&|\|\|)\s*set\s+(?:"[^"=]+=[^"]*"|[^\s=]+=[^&|]+)/i],
  ['percent-env', /%[A-Za-z_][A-Za-z0-9_]*%/],
  ['drive-path', /\b[A-Za-z]:\\[^\s"']*/],
  ['windows-relative-path', /(?:^|\s)\.\\[^\s"']+/],
  ['cmd-file', /\b(?:npm|npx|pnpm|yarn)\.cmd\b/i],
  ['exe-file', /\b[\w.-]+\.exe\b/i],
  ['powershell', /\bpowershell(?:\.exe)?\b/i],
  ['start-command', /(?:^|&&|\|\|)\s*start(?:\s+"[^"]*")?\s+/i],
];

export async function inspectWorkspace(workspacePath) {
  const root = path.resolve(workspacePath);
  const packagePath = path.join(root, 'package.json');
  if (!(await pathExists(packagePath))) {
    throw new Error(`No package.json found in ${root}`);
  }

  const pkg = await readJson(packagePath);
  const packageManager = await detectPackageManager(root, pkg.packageManager);
  const launchers = await findRootLaunchers(root);
  const scriptFindings = [];

  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    for (const [kind, pattern] of WINDOWS_PATTERNS) {
      if (pattern.test(command)) scriptFindings.push({ script: name, kind, command });
    }
  }

  const dependencyFindings = findPlatformDependencies({
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  });

  return {
    root,
    package: {
      name: pkg.name ?? path.basename(root),
      version: pkg.version ?? null,
      type: pkg.type ?? 'commonjs',
    },
    packageManager,
    scripts: pkg.scripts ?? {},
    suggestedScript: suggestScript(pkg.scripts ?? {}),
    launchers,
    windows: {
      scriptFindings,
      dependencyFindings,
      score: scoreWindowsOrientation(scriptFindings, dependencyFindings, launchers),
    },
  };
}

async function detectPackageManager(root, declared) {
  if (declared) return declared.split('@')[0];
  const candidates = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, manager] of candidates) {
    if (await pathExists(path.join(root, file))) return manager;
  }
  return 'npm';
}

async function findRootLaunchers(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:cmd|bat|ps1)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function findPlatformDependencies(dependencies) {
  return Object.keys(dependencies)
    .filter((name) => /(?:^|[-/])win32(?:[-/]|$)|windows|mingw/i.test(name))
    .sort();
}

function suggestScript(scripts) {
  for (const name of ['dev', 'start', 'serve', 'preview']) {
    if (scripts[name]) return name;
  }
  return null;
}

function scoreWindowsOrientation(scriptFindings, dependencyFindings, launchers) {
  return scriptFindings.length * 2 + dependencyFindings.length * 2 + launchers.length;
}
