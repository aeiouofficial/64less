export function splitCommandChain(input) {
  const source = String(input);
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && quote === '"') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    const operator = source.slice(index, index + 2);
    if (operator !== '&&' && operator !== '||') continue;

    const command = source.slice(start, index).trim();
    if (!command) return { parts: [], error: 'empty-command-segment' };
    parts.push({ command, operator });
    index += 1;
    start = index + 1;
  }

  if (quote) return { parts: [], error: 'unbalanced-quote' };

  const tail = source.slice(start).trim();
  if (!tail) return { parts: [], error: parts.length ? 'empty-command-segment' : 'empty-command' };
  parts.push({ command: tail, operator: null });
  return { parts, error: null };
}

export function joinCommandChain(parts) {
  return parts
    .map((part) => `${part.command}${part.operator ? ` ${part.operator} ` : ''}`)
    .join('')
    .trim();
}
