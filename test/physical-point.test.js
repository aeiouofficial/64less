import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePhysicalPoint } from '../src/qa/physical-point.js';

test('prefers CDP outer-window bounds over X11 Chromium screen offsets', () => {
  const point = resolvePhysicalPoint({
    pageX: 101,
    pageY: 211,
    screenX: 0,
    screenY: 59,
    outerWidth: 1280,
    outerHeight: 720,
    innerWidth: 1280,
    innerHeight: 633,
  }, { left: 0, top: 0, width: 1280, height: 720 });
  assert.deepEqual(point, { x: 101, y: 298 });
});

test('falls back to browser-reported screen coordinates when CDP bounds are unavailable', () => {
  const point = resolvePhysicalPoint({
    pageX: 40,
    pageY: 50,
    screenX: 10,
    screenY: 20,
    outerWidth: 800,
    outerHeight: 700,
    innerWidth: 780,
    innerHeight: 620,
  });
  assert.deepEqual(point, { x: 50, y: 150 });
});
