import os from 'node:os';
import path from 'node:path';

export function buildWorkspaceEnvironment(workspaceRoot, overrides = {}) {
  const home = os.homedir();
  const workspaceBin = path.join(workspaceRoot, 'node_modules', '.bin');
  const hostPath = process.env.PATH ?? '';
  return {
    ...process.env,
    PATH: `${workspaceBin}${path.delimiter}${hostPath}`,
    USERPROFILE: process.env.USERPROFILE ?? home,
    HOMEDRIVE: process.env.HOMEDRIVE ?? '/',
    HOMEPATH: process.env.HOMEPATH ?? home,
    LOCALAPPDATA: process.env.LOCALAPPDATA ?? path.join(home, '.local', 'share'),
    APPDATA: process.env.APPDATA ?? path.join(home, '.config'),
    TEMP: process.env.TEMP ?? os.tmpdir(),
    TMP: process.env.TMP ?? os.tmpdir(),
    INIT_CWD: workspaceRoot,
    ...overrides,
  };
}
