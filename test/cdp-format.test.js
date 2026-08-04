import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCdpEvent } from '../src/qa/cdp-format.js';

const at = new Date('2026-08-04T12:34:56.789Z');

test('formats browser console events for the visible cockpit', () => {
  const line = formatCdpEvent({
    method: 'Runtime.consoleAPICalled',
    params: { type: 'log', args: [{ type: 'string', value: 'ready' }, { type: 'number', value: 7 }] },
  }, at);
  assert.equal(line, '12:34:56.789 console.log: ready 7');
});

test('only promotes failed HTTP responses to the readable browser log', () => {
  assert.equal(formatCdpEvent({
    method: 'Network.responseReceived',
    params: { response: { status: 200, url: 'http://localhost/ok' } },
  }, at), null);
  assert.equal(formatCdpEvent({
    method: 'Network.responseReceived',
    params: { response: { status: 404, url: 'http://localhost/missing' } },
  }, at), '12:34:56.789 HTTP 404: http://localhost/missing');
});
