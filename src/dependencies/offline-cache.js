import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathExists, writeJson } from '../lib/fs.js';

const execFileAsync = promisify(execFile);

export async function indexOfflinePackageDirectory(rootPath) {
  const root = path.resolve(rootPath);
  const archives = [];
  for (const file of await walk(root)) {
    if (!file.toLowerCase().endsWith('.tgz')) continue;
    archives.push(await inspectOfflinePackageArchive(file));
  }
  return { root, archives: archives.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)) };
}

export function matchOfflinePackages(missingEntries, cacheIndex, host = {}) {
  const byIdentity = new Map();
  for (const entry of cacheIndex.archives) {
    const key = `${entry.name}@${entry.version}`;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(entry);
  }

  const matched = [];
  const unmatched = [];
  const rejected = [];
  for (const entry of missingEntries) {
    const candidates = byIdentity.get(`${entry.name}@${entry.version}`) ?? [];
    const archive = candidates.find((candidate) => archiveSupportsHost(candidate, host));
    if (archive) matched.push({ dependency: entry, archive });
    else if (candidates.length > 0) rejected.push({ dependency: entry, archives: candidates, reason: 'archive-platform-mismatch' });
    else unmatched.push(entry);
  }
  return { matched, unmatched, rejected };
}

export async function repairFromOfflinePackages(workspaceRoot, matches) {
  const root = path.resolve(workspaceRoot);
  const repairId = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingRoot = path.join(root, '.64less', 'dependency-staging', repairId);
  const recordPath = path.join(root, '.64less', 'dependency-repairs', `${repairId}.json`);
  const staged = [];
  const installed = [];
  const skipped = [];

  await fs.mkdir(stagingRoot, { recursive: true });
  try {
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const { dependency, archive } = match;
      if (archive.installScripts.length > 0) {
        skipped.push({ name: dependency.name, version: dependency.version, reason: 'install-scripts', scripts: archive.installScripts });
        continue;
      }

      const target = safeNodeModulesTarget(root, dependency.location);
      if (await pathExists(target)) {
        skipped.push({ name: dependency.name, version: dependency.version, reason: 'target-exists', target });
        continue;
      }

      const stage = path.join(stagingRoot, String(index));
      await fs.mkdir(stage, { recursive: true });
      await execFileAsync('tar', ['-xzf', archive.file, '-C', stage], { maxBuffer: 1024 * 1024 });
      const extracted = path.join(stage, 'package');
      const metadata = JSON.parse(await fs.readFile(path.join(extracted, 'package.json'), 'utf8'));
      if (metadata.name !== dependency.name || metadata.version !== dependency.version) {
        throw new Error(`Archive identity changed during staging: expected ${dependency.name}@${dependency.version}`);
      }
      staged.push({ dependency, archive, extracted, target });
    }

    for (const item of staged) {
      await fs.mkdir(path.dirname(item.target), { recursive: true });
      await fs.rename(item.extracted, item.target);
      installed.push({
        name: item.dependency.name,
        version: item.dependency.version,
        target: item.target,
        source: item.archive.file,
        sha256: item.archive.sha256,
      });
    }
  } catch (error) {
    for (const item of installed.reverse()) await fs.rm(item.target, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }

  const record = {
    createdAt: new Date().toISOString(),
    workspace: root,
    mode: 'exact-offline-package-extraction',
    manifestModified: false,
    lockfileModified: false,
    incompatiblePackagesRemoved: false,
    installed,
    skipped,
  };
  await writeJson(recordPath, record);
  return { ...record, recordPath };
}

function archiveSupportsHost(archive, host) {
  return supports(archive.os, host.platform)
    && supports(archive.cpu, host.arch)
    && supports(archive.libc, host.libc);
}

function supports(rules, value) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  if (!value) return false;
  const denied = rules.filter((item) => String(item).startsWith('!')).map((item) => String(item).slice(1));
  if (denied.includes(value)) return false;
  const allowed = rules.filter((item) => !String(item).startsWith('!'));
  return allowed.length === 0 || allowed.includes(value);
}

function safeNodeModulesTarget(root, location) {
  if (!String(location).startsWith('node_modules/')) throw new Error(`Refusing non-node_modules repair target: ${location}`);
  const target = path.resolve(root, location);
  const nodeModulesRoot = path.resolve(root, 'node_modules');
  if (!target.startsWith(`${nodeModulesRoot}${path.sep}`)) throw new Error(`Refusing repair target outside node_modules: ${location}`);
  return target;
}

export async function inspectOfflinePackageArchive(file) {
  const metadata = await readPackageMetadata(file);
  return {
    file: path.resolve(file),
    name: metadata.name,
    version: metadata.version,
    os: metadata.os ?? null,
    cpu: metadata.cpu ?? null,
    libc: metadata.libc ?? null,
    installScripts: ['preinstall', 'install', 'postinstall'].filter((name) => metadata.scripts?.[name]),
    sha256: await sha256File(file),
  };
}

async function readPackageMetadata(file) {
  const { stdout } = await execFileAsync('tar', ['-xOf', file, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  const pkg = JSON.parse(stdout);
  if (!pkg.name || !pkg.version) throw new Error(`Package archive has no name/version: ${file}`);
  return pkg;
}

async function walk(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(file));
    else if (entry.isFile()) output.push(file);
  }
  return output;
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return hash.digest('hex');
}
