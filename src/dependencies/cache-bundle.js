import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathExists, readJson, writeJson } from '../lib/fs.js';
import { indexOfflinePackageDirectory, inspectOfflinePackageArchive } from './offline-cache.js';

export const CACHE_MANIFEST = '64less-cache.json';
export const CACHE_FORMAT_VERSION = 1;

export async function exportOfflineCache(sourcePath, outputPath, { force = false } = {}) {
  const source = path.resolve(sourcePath);
  const output = path.resolve(outputPath);
  if (await pathExists(output)) {
    if (!force) throw new Error(`Offline cache destination already exists: ${output}`);
    await fs.rm(output, { recursive: true, force: true });
  }

  const index = await loadOfflineCacheSource(source);
  const staging = `${output}.staging-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(path.join(staging, 'packages'), { recursive: true });

  const archives = [];
  try {
    for (const archive of index.archives) {
      const relativePath = path.posix.join('packages', `${archive.sha256}.tgz`);
      const target = path.join(staging, ...relativePath.split('/'));
      if (!(await pathExists(target))) await fs.copyFile(archive.file, target);
      archives.push({
        name: archive.name,
        version: archive.version,
        relativePath,
        sha256: archive.sha256,
        os: archive.os ?? null,
        cpu: archive.cpu ?? null,
        libc: archive.libc ?? null,
        installScripts: [...(archive.installScripts ?? [])],
      });
    }

    archives.sort(compareArchiveRecords);
    await writeJson(path.join(staging, CACHE_MANIFEST), {
      formatVersion: CACHE_FORMAT_VERSION,
      archives,
    });
    await fs.rename(staging, output);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }

  return loadOfflineCacheBundle(output);
}

export async function importOfflineCache(bundlePath, destinationPath, { force = false } = {}) {
  const source = path.resolve(bundlePath);
  const destination = path.resolve(destinationPath);
  const bundle = await loadOfflineCacheBundle(source);

  if (await pathExists(destination)) {
    if (!force) throw new Error(`Offline cache destination already exists: ${destination}`);
    await fs.rm(destination, { recursive: true, force: true });
  }

  const staging = `${destination}.staging-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(path.join(staging, 'packages'), { recursive: true });
  try {
    for (const archive of bundle.archives) {
      const target = path.join(staging, ...archive.relativePath.split('/'));
      await fs.copyFile(archive.file, target);
    }
    await writeJson(path.join(staging, CACHE_MANIFEST), bundle.manifest);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(staging, destination);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return loadOfflineCacheBundle(destination);
}

export async function loadOfflineCacheSource(sourcePath) {
  const source = path.resolve(sourcePath);
  if (await pathExists(path.join(source, CACHE_MANIFEST))) return loadOfflineCacheBundle(source);
  return indexOfflinePackageDirectory(source);
}

export async function loadOfflineCacheBundle(bundlePath) {
  const root = path.resolve(bundlePath);
  const manifestPath = path.join(root, CACHE_MANIFEST);
  if (!(await pathExists(manifestPath))) throw new Error(`Offline cache manifest not found: ${manifestPath}`);
  const manifest = await readJson(manifestPath);
  if (manifest.formatVersion !== CACHE_FORMAT_VERSION) {
    throw new Error(`Unsupported offline cache format: ${manifest.formatVersion ?? 'missing'}`);
  }
  if (!Array.isArray(manifest.archives)) throw new Error('Offline cache manifest archives must be an array');

  const archives = [];
  for (const record of manifest.archives) {
    validateManifestRecord(record);
    const file = safeBundlePath(root, record.relativePath);
    if (!(await pathExists(file))) throw new Error(`Offline cache archive is missing: ${record.relativePath}`);
    const actualHash = await sha256File(file);
    if (actualHash !== record.sha256) throw new Error(`Offline cache hash mismatch: ${record.relativePath}`);
    const actual = await inspectOfflinePackageArchive(file);
    if (!sameMetadata(actual, record)) throw new Error(`Offline cache metadata mismatch: ${record.relativePath}`);
    archives.push({ ...actual, relativePath: record.relativePath });
  }

  return {
    root,
    manifestPath,
    manifest,
    formatVersion: manifest.formatVersion,
    archives: archives.sort(compareArchiveRecords),
    verified: true,
  };
}

function validateManifestRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Offline cache manifest contains an invalid archive record');
  if (!record.name || !record.version) throw new Error('Offline cache archive record is missing name/version');
  if (!/^[a-f0-9]{64}$/.test(String(record.sha256))) throw new Error(`Offline cache archive has invalid SHA-256: ${record.name}@${record.version}`);
  if (typeof record.relativePath !== 'string' || !record.relativePath.startsWith('packages/')) {
    throw new Error(`Offline cache archive has unsafe relative path: ${record.relativePath}`);
  }
  if (path.posix.normalize(record.relativePath) !== record.relativePath || record.relativePath.includes('..')) {
    throw new Error(`Offline cache archive path is not normalized: ${record.relativePath}`);
  }
}

function safeBundlePath(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split('/'));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Offline cache path escapes bundle: ${relativePath}`);
  return target;
}

function sameMetadata(actual, record) {
  return actual.name === record.name
    && actual.version === record.version
    && sameJson(actual.os ?? null, record.os ?? null)
    && sameJson(actual.cpu ?? null, record.cpu ?? null)
    && sameJson(actual.libc ?? null, record.libc ?? null)
    && sameJson(actual.installScripts ?? [], record.installScripts ?? []);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareArchiveRecords(left, right) {
  return `${left.name}@${left.version}:${left.sha256}`.localeCompare(`${right.name}@${right.version}:${right.sha256}`);
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
