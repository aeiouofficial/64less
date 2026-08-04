import path from 'node:path';

export function translateWindowsPaths(command, driveMappings = {}) {
  let output = command;
  const applied = [];

  for (const [windowsPrefix, linuxPrefix] of Object.entries(driveMappings)) {
    const normalizedWindows = windowsPrefix.replaceAll('/', '\\').replace(/\\+$/, '');
    const prefixPattern = escapeRegExp(normalizedWindows).replaceAll('\\\\', '[\\\\/]+');
    const pattern = new RegExp(`${prefixPattern}((?:[\\\\/][^\\s\"']*)?)`, 'gi');
    output = output.replace(pattern, (match, suffix) => {
      const translated = `${linuxPrefix}${String(suffix ?? '').replaceAll('\\', '/')}`;
      applied.push({ from: match, to: translated });
      return translated;
    });
  }

  output = output.replace(/(^|[\s"'])\.\\([A-Za-z0-9_.-][^\s"']*)/g, (match, prefix, relative) => {
    const translated = `./${relative.replaceAll('\\', '/')}`;
    applied.push({ from: match.slice(prefix.length), to: translated });
    return `${prefix}${translated}`;
  });

  return { command: output, applied };
}

export function normalizeMappedPath(value, workspaceRoot, driveMappings = {}) {
  if (!value) return value;
  for (const [windowsPrefix, linuxPrefix] of Object.entries(driveMappings)) {
    if (value.toLowerCase().startsWith(windowsPrefix.toLowerCase())) {
      const suffix = value.slice(windowsPrefix.length).replaceAll('\\', '/').replace(/^\/+/, '');
      return path.join(linuxPrefix, suffix);
    }
  }
  if (/^[A-Za-z]:\\/.test(value)) return null;
  return path.resolve(workspaceRoot, value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
