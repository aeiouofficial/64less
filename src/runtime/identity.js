import fs from 'node:fs';

const INTERACTIVE_SHELL_DENYLIST = new Set([
  '/usr/sbin/nologin',
  '/sbin/nologin',
  '/bin/false',
  '/usr/bin/false',
]);

export function parsePasswd(text) {
  return String(text)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, , uidText, gidText, , home, shell] = line.split(':');
      return {
        name,
        uid: Number(uidText),
        gid: Number(gidText),
        home,
        shell,
      };
    })
    .filter((entry) => entry.name && Number.isInteger(entry.uid) && Number.isInteger(entry.gid));
}

export function selectNonRootIdentity(entries, preferredName = null) {
  if (preferredName) {
    const preferred = entries.find((entry) => entry.name === preferredName);
    if (!preferred) throw new Error(`Configured browser user does not exist: ${preferredName}`);
    if (preferred.uid === 0) throw new Error('Configured browser user must not be root');
    return preferred;
  }

  return entries.find((entry) => (
    entry.uid >= 1000
    && entry.uid < 65534
    && entry.home
    && !INTERACTIVE_SHELL_DENYLIST.has(entry.shell)
  )) ?? null;
}

export function resolveBrowserIdentity(preferredName = null) {
  if (typeof process.geteuid !== 'function' || process.geteuid() !== 0) return null;
  const passwd = fs.readFileSync('/etc/passwd', 'utf8');
  return selectNonRootIdentity(parsePasswd(passwd), preferredName);
}
