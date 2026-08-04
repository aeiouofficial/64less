import path from 'node:path';
import { inspectWorkspace } from '../workspace/inspect.js';
import { inspectDependencies } from '../dependencies/inspect.js';
import { matchOfflinePackages, repairFromOfflinePackages } from '../dependencies/offline-cache.js';
import { exportOfflineCache, importOfflineCache, loadOfflineCacheSource } from '../dependencies/cache-bundle.js';
import { commandExists } from '../lib/process.js';

export async function depsCommand(workspacePath, {
  json = false,
  cachePath = null,
  repair = false,
  exportCachePath = null,
  importCachePath = null,
  force = false,
} = {}) {
  const workspace = await inspectWorkspace(workspacePath);
  const report = await inspectDependencies(workspace.root);

  if ((cachePath || exportCachePath || importCachePath || repair) && !(await commandExists('tar'))) {
    throw new Error('offline package operations require a local tar executable');
  }

  if (importCachePath) {
    const destination = path.join(workspace.root, '.64less', 'offline-cache');
    const imported = await importOfflineCache(importCachePath, destination, { force });
    report.cacheImport = summarizeCache(imported);
    cachePath = destination;
  }

  if (cachePath) {
    const cacheIndex = await loadOfflineCacheSource(cachePath);
    report.offlinePackageSource = {
      ...cacheIndex,
      coverage: matchOfflinePackages(report.compatibleMissing, cacheIndex, report.host),
    };
  }

  if (exportCachePath) {
    if (!cachePath) throw new Error('--export-cache requires --cache or --import-cache');
    const exported = await exportOfflineCache(cachePath, exportCachePath, { force });
    report.cacheExport = summarizeCache(exported);
  }

  if (repair) {
    if (!report.offlinePackageSource) throw new Error('--repair requires --cache or --import-cache');
    report.repair = await repairFromOfflinePackages(workspace.root, report.offlinePackageSource.coverage.matched);
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  }

  process.stdout.write(`host: ${report.host.platform}/${report.host.arch}${report.host.libc ? `/${report.host.libc}` : ''}\n`);
  process.stdout.write(`lockfile: ${report.lockfile ? `npm v${report.lockfile.version}` : 'none'}\n`);
  process.stdout.write(`platform-specific entries: ${report.platformEntries.length}\n`);
  process.stdout.write(`incompatible required: ${report.incompatibleRequired.length}\n`);
  process.stdout.write(`incompatible optional: ${report.incompatibleOptional.length}\n`);
  process.stdout.write(`wrong-platform installed: ${report.incompatibleInstalled.length}\n`);
  process.stdout.write(`host-platform missing: ${report.compatibleMissing.length}\n`);
  if (report.cacheImport) process.stdout.write(`cache imported: ${report.cacheImport.archives} archives -> ${report.cacheImport.root}\n`);
  if (report.offlinePackageSource) {
    process.stdout.write(`offline package archives: ${report.offlinePackageSource.archives.length}\n`);
    process.stdout.write(`exact missing-package matches: ${report.offlinePackageSource.coverage.matched.length}/${report.compatibleMissing.length}\n`);
  }
  if (report.cacheExport) process.stdout.write(`cache exported: ${report.cacheExport.archives} archives -> ${report.cacheExport.root}\n`);
  if (report.repair) process.stdout.write(`offline repair installed: ${report.repair.installed.length}, skipped: ${report.repair.skipped.length}\n`);
  if (report.installPlan) {
    process.stdout.write(`offline cache: ${report.installPlan.cacheDir}\n`);
    process.stdout.write(`populate: ${report.installPlan.populate}\n`);
    process.stdout.write(`offline replay: ${report.installPlan.replayOffline}\n`);
  }
  return report;
}

function summarizeCache(cache) {
  return {
    root: cache.root,
    manifestPath: cache.manifestPath ?? null,
    formatVersion: cache.formatVersion ?? null,
    archives: cache.archives.length,
    verified: Boolean(cache.verified),
  };
}
