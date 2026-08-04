import fs from 'node:fs';
import path from 'node:path';
import { formatCdpEvent } from './cdp-format.js';

export async function startCdpCapture({ port, sessionDir, url = null, timeoutMs = 15000 }) {
  const target = await waitForCdpTarget(port, timeoutMs, url);
  const log = fs.createWriteStream(path.join(sessionDir, 'cdp.ndjson'), { flags: 'a' });
  const readableLog = fs.createWriteStream(path.join(sessionDir, 'browser.log'), { flags: 'a' });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    if (message.method) {
      const at = new Date();
      log.write(`${JSON.stringify({ at: at.toISOString(), ...message })}\n`);
      const readable = formatCdpEvent(message, at);
      if (readable) readableLog.write(`${readable}\n`);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 5000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await Promise.all([
    send('Runtime.enable'),
    send('Log.enable'),
    send('Network.enable'),
    send('Page.enable'),
    send('Performance.enable'),
  ]);

  return {
    target,
    close() {
      socket.close();
      log.end();
      readableLog.end();
    },
    send,
  };
}

export async function waitForCdpTarget(port, timeoutMs = 5000, requestedUrl = null) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl && !String(target.url).startsWith('devtools://'));
      const page = requestedUrl
        ? pages.find((target) => sameLocalDocument(target.url, requestedUrl)) ?? pages[0]
        : pages[0];
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chromium CDP endpoint did not become ready${lastError ? `: ${lastError.message}` : ''}`);
}

function sameLocalDocument(candidate, requested) {
  try {
    const left = new URL(candidate);
    const right = new URL(requested);
    return left.origin === right.origin && left.pathname === right.pathname;
  } catch {
    return candidate === requested;
  }
}
