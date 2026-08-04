import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists, readJson, writeJson } from '../lib/fs.js';

const MANAGED_POLICY_DIR = '/etc/chromium/policies/managed';
const SESSION_POLICY = path.join(MANAGED_POLICY_DIR, '64less-local-qa.json');

export async function prepareLocalQaPolicy({ recoveryStatePath = null } = {}) {
  const state = await inspectManagedPolicy();
  if (!state.blocksAllUrls) return persistRecoveryState({ changed: false, reason: 'not-required' }, recoveryStatePath);
  if (state.allowsLocalhost) return persistRecoveryState({ changed: false, reason: 'already-allowed' }, recoveryStatePath);
  if (typeof process.geteuid !== 'function' || process.geteuid() !== 0) {
    return persistRecoveryState({ changed: false, reason: 'requires-root', blocked: true }, recoveryStatePath);
  }

  const previous = (await pathExists(SESSION_POLICY)) ? await fs.readFile(SESSION_POLICY) : null;
  const policy = {
    URLAllowlist: [
      'http://127.0.0.1',
      'http://localhost',
      'http://[::1]',
      'devtools://*',
    ],
  };
  await fs.writeFile(SESSION_POLICY, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o644 });
  return persistRecoveryState({ changed: true, reason: 'localhost-exception-added', previous }, recoveryStatePath);
}

export async function restoreLocalQaPolicy(state) {
  if (!state?.changed) return false;
  if (state.previous) await fs.writeFile(SESSION_POLICY, state.previous, { mode: 0o644 });
  else await fs.rm(SESSION_POLICY, { force: true });
  if (state.recoveryStatePath) {
    await writeJson(state.recoveryStatePath, { changed: true, restored: true, restoredAt: new Date().toISOString() });
  }
  return true;
}

export async function restoreLocalQaPolicyFromFile(recoveryStatePath) {
  if (!(await pathExists(recoveryStatePath))) return false;
  const state = await readJson(recoveryStatePath);
  if (!state.changed || state.restored) return Boolean(state.restored);
  if (typeof process.geteuid !== 'function' || process.geteuid() !== 0) return false;

  if (state.previousBase64) await fs.writeFile(SESSION_POLICY, Buffer.from(state.previousBase64, 'base64'), { mode: 0o644 });
  else await fs.rm(SESSION_POLICY, { force: true });
  await writeJson(recoveryStatePath, { ...state, restored: true, restoredAt: new Date().toISOString() });
  return true;
}

export async function inspectManagedPolicy() {
  const merged = {};
  let entries = [];
  try {
    entries = await fs.readdir(MANAGED_POLICY_DIR, { withFileTypes: true });
  } catch {
    return { blocksAllUrls: false, allowsLocalhost: false, files: [] };
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(MANAGED_POLICY_DIR, entry.name);
    try {
      const policy = await readJson(filePath);
      files.push(filePath);
      for (const [key, value] of Object.entries(policy)) merged[key] = value;
    } catch {
      // A malformed third-party policy is not ours to repair.
    }
  }

  const blocklist = Array.isArray(merged.URLBlocklist) ? merged.URLBlocklist : [];
  const allowlist = Array.isArray(merged.URLAllowlist) ? merged.URLAllowlist : [];
  return {
    blocksAllUrls: blocklist.includes('*'),
    allowsLocalhost: allowlist.some((item) => /(?:127\.0\.0\.1|localhost|\[::1\])/.test(String(item))),
    files,
  };
}

async function persistRecoveryState(state, recoveryStatePath) {
  if (!recoveryStatePath) return state;
  const serializable = {
    changed: Boolean(state.changed),
    reason: state.reason ?? null,
    blocked: Boolean(state.blocked),
    restored: false,
    previousBase64: state.previous ? Buffer.from(state.previous).toString('base64') : null,
  };
  await writeJson(recoveryStatePath, serializable);
  return { ...state, recoveryStatePath };
}
