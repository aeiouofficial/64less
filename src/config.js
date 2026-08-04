import path from 'node:path';
import { pathExists, readJson } from './lib/fs.js';

export const DEFAULT_CONFIG = Object.freeze({
  command: null,
  url: null,
  readyTimeoutMs: 120000,
  env: {},
  windows: {
    driveMappings: {},
  },
  executors: {
    powershellCore: {
      enabled: false,
      command: 'pwsh',
    },
  },
  qa: {
    display: ':96',
    size: '1920x1080',
    fps: 30,
    record: true,
    cockpit: true,
    chromium: null,
    browserUser: null,
    remoteDebuggingPort: 9222,
    netlog: false,
    browserRestartLimit: 1,
    telemetry: true,
    telemetryIntervalMs: 2000,
    telemetryBrowserMetricsEvery: 3,
    telemetryFpsWindowMs: 400,
    extraChromiumArgs: [],
  },
});

export async function loadConfig(workspaceRoot, explicitConfigPath = null) {
  const configPath = explicitConfigPath ?? path.join(workspaceRoot, '64less.config.json');
  const user = (await pathExists(configPath)) ? await readJson(configPath) : {};
  return mergeConfig(DEFAULT_CONFIG, user);
}

export function mergeConfig(base, override) {
  const output = { ...base, ...override };
  output.env = { ...(base.env ?? {}), ...(override.env ?? {}) };
  output.windows = {
    ...(base.windows ?? {}),
    ...(override.windows ?? {}),
    driveMappings: {
      ...(base.windows?.driveMappings ?? {}),
      ...(override.windows?.driveMappings ?? {}),
    },
  };
  output.executors = {
    ...(base.executors ?? {}),
    ...(override.executors ?? {}),
    powershellCore: {
      ...(base.executors?.powershellCore ?? {}),
      ...(override.executors?.powershellCore ?? {}),
    },
  };
  output.qa = {
    ...(base.qa ?? {}),
    ...(override.qa ?? {}),
  };
  return output;
}
