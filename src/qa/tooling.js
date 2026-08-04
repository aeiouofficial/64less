import { commandExists } from '../lib/process.js';

const BASE_TOOLS = ['node', 'bash'];
const QA_TOOLS = ['chromium', 'ffmpeg', 'Xvfb', 'openbox', 'xterm', 'wmctrl'];

export async function inspectTooling({ qa = false } = {}) {
  const names = qa ? [...BASE_TOOLS, ...QA_TOOLS] : BASE_TOOLS;
  const entries = await Promise.all(names.map(async (name) => [name, await commandExists(name)]));
  return Object.fromEntries(entries);
}

export function missingRequiredTools(tooling, { qa = false } = {}) {
  const required = qa ? ['node', 'bash', 'chromium', 'ffmpeg'] : ['node', 'bash'];
  return required.filter((name) => !tooling[name]);
}
