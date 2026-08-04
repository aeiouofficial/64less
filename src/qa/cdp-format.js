export function formatCdpEvent(message, at = new Date()) {
  const params = message.params ?? {};
  const time = at.toISOString().slice(11, 23);

  switch (message.method) {
    case 'Runtime.consoleAPICalled': {
      const type = params.type ?? 'log';
      const text = (params.args ?? []).map(formatRemoteValue).join(' ');
      return `${time} console.${type}: ${text}`;
    }
    case 'Runtime.exceptionThrown':
      return `${time} exception: ${params.exceptionDetails?.text ?? 'Uncaught exception'}`;
    case 'Log.entryAdded':
      return `${time} ${params.entry?.level ?? 'log'}: ${params.entry?.text ?? ''}`;
    case 'Network.responseReceived': {
      const status = Number(params.response?.status ?? 0);
      if (status < 400) return null;
      return `${time} HTTP ${status}: ${params.response?.url ?? ''}`;
    }
    case 'Network.loadingFailed':
      return `${time} network failed: ${params.errorText ?? 'unknown error'} ${params.type ?? ''}`.trimEnd();
    case 'Page.loadEventFired':
      return `${time} page loaded`;
    default:
      return null;
  }
}

function formatRemoteValue(value) {
  if (Object.hasOwn(value, 'value')) {
    if (typeof value.value === 'string') return value.value;
    try {
      return JSON.stringify(value.value);
    } catch {
      return String(value.value);
    }
  }
  return value.unserializableValue ?? value.description ?? `[${value.type ?? 'value'}]`;
}
