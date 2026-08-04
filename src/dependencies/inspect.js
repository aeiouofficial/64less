import path from 'node:path';
import { pathExists, readJson } from '../lib/fs.js';

export async function inspectDependencies(workspaceRoot, { platform = process.platform, arch = process.arch, libc = detectHostLibc() } = {}) {
  const lockPath = path.join(workspaceRoot, 'package-lock.json');
  if (!(await pathExists(lockPath))) {
    return {
      packageManager: null,
      lockfile: null,
      host: { platform, arch, libc },
      platformEntries: [],
      incompatibleRequired: [],
      incompatibleOptional: [],
      incompatibleInstalled: [],
      compatibleMissing: [],
      installPlan: null,
    };
  }

  const lock = await readJson(lockPath);
  const platformEntries = [];
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (!location || (!entry.os && !entry.cpu && !entry.libc)) continue;
    const compatible = supports(entry.os, platform) && supports(entry.cpu, arch) && supports(entry.libc, libc);
    platformEntries.push({
      location,
      name: packageNameFromLocation(location),
      version: entry.version ?? null,
      os: entry.os ?? null,
      cpu: entry.cpu ?? null,
      libc: entry.libc ?? null,
      optional: Boolean(entry.optional),
      compatible,
      installed: await pathExists(path.join(workspaceRoot, location)),
    });
  }

  const incompatible = platformEntries.filter((entry) => !entry.compatible);
  const compatible = platformEntries.filter((entry) => entry.compatible);
  const cacheDir = path.join(workspaceRoot, '.64less', 'npm-cache');
  const installBase = lock.lockfileVersion ? 'npm ci --include=optional' : 'npm install --include=optional';

  return {
    packageManager: 'npm',
    lockfile: { path: lockPath, version: lock.lockfileVersion ?? null },
    host: { platform, arch, libc },
    platformEntries,
    incompatibleRequired: incompatible.filter((entry) => !entry.optional),
    incompatibleOptional: incompatible.filter((entry) => entry.optional),
    incompatibleInstalled: incompatible.filter((entry) => entry.installed),
    compatibleMissing: compatible.filter((entry) => !entry.installed),
    installPlan: {
      mutatesManifest: false,
      cacheDir,
      populate: `${installBase} --prefer-offline --cache ${shellDisplayQuote(cacheDir)}`,
      replayOffline: `${installBase} --offline --cache ${shellDisplayQuote(cacheDir)}`,
      note: 'Populate requires packages to already be reachable or cached; replayOffline performs no registry fetch.',
    },
  };
}

function supports(rules, value) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  const denied = rules.filter((item) => String(item).startsWith('!')).map((item) => String(item).slice(1));
  if (denied.includes(value)) return false;
  const allowed = rules.filter((item) => !String(item).startsWith('!'));
  return allowed.length === 0 || allowed.includes(value);
}

function packageNameFromLocation(location) {
  const marker = 'node_modules/';
  const index = location.lastIndexOf(marker);
  const tail = index === -1 ? location : location.slice(index + marker.length);
  const parts = tail.split('/');
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function shellDisplayQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function detectHostLibc() {
  if (process.platform !== 'linux') return null;
  try {
    return process.report?.getReport?.().header?.glibcVersionRuntime ? 'glibc' : 'musl';
  } catch {
    return null;
  }
}
