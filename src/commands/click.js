import { loadReadyBrowserSession, runPhysicalInput } from '../qa/live-session.js';
import { waitForCdpTarget } from '../qa/cdp.js';
import { resolvePhysicalPoint } from '../qa/physical-point.js';

export async function clickCommand(workspacePath, selector) {
  if (!selector) throw new Error('CSS selector required');
  const { live } = await loadReadyBrowserSession(workspacePath);
  const port = live.remoteDebuggingPort ?? 9222;
  const target = await waitForCdpTarget(port, 5000, live.url ?? null);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  try {
    const result = await evaluate(socket, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        pageX: rect.left + rect.width / 2,
        pageY: rect.top + rect.height / 2,
        screenX,
        screenY,
        outerWidth,
        outerHeight,
        innerWidth,
        innerHeight
      };
    })()`);
    if (!result) throw new Error(`Selector did not match an element: ${selector}`);

    const windowInfo = await request(socket, 2, 'Browser.getWindowForTarget').catch(() => null);
    const { x, y } = resolvePhysicalPoint(result, windowInfo?.bounds);
    await runPhysicalInput(live, 'move', [x, y], { selector, resolved: { x, y } });
    await runPhysicalInput(live, 'click', [1], { selector, resolved: { x, y } });
    process.stdout.write(`${x},${y}\n`);
    return { x, y };
  } finally {
    socket.close();
  }
}

function evaluate(socket, expression) {
  return request(socket, 1, 'Runtime.evaluate', { expression, returnByValue: true })
    .then((message) => {
      if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.text);
      return message.result?.result?.value ?? null;
    });
}

function request(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      socket.removeEventListener('message', handler);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message);
    };
    socket.addEventListener('message', handler);
    socket.send(JSON.stringify({ id, method, params }));
  });
}
