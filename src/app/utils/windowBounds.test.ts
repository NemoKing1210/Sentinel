import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  intersectsVisibleArea,
  isMinimizedWindowPosition,
  isVisibleOnAnyMonitor,
  MINIMIZED_WINDOW_SENTINEL,
} from './windowBounds.ts';

const primary = { workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } } };
const secondary = { workArea: { position: { x: 1920, y: 0 }, size: { width: 1280, height: 1024 } } };

test('detects the Windows minimized-window sentinel position', () => {
  assert.equal(isMinimizedWindowPosition(-32000, -32000), true);
  assert.equal(isMinimizedWindowPosition(MINIMIZED_WINDOW_SENTINEL, 100), true);
  assert.equal(isMinimizedWindowPosition(100, 100), false);
});

test('keeps a window that overlaps the primary monitor', () => {
  assert.equal(intersectsVisibleArea({ x: 100, y: 100, width: 1368, height: 887 }, primary.workArea), true);
});

test('rejects a window parked outside every monitor', () => {
  assert.equal(intersectsVisibleArea({ x: -32000, y: -32000, width: 1368, height: 887 }, primary.workArea), false);
});

test('accepts a window on a secondary monitor', () => {
  const rect = { x: 2000, y: 100, width: 1000, height: 700 };
  assert.equal(isVisibleOnAnyMonitor(rect, [primary, secondary]), true);
});

test('rejects a window that no longer fits the connected monitors', () => {
  const rect = { x: 2400, y: 100, width: 1000, height: 700 };
  assert.equal(isVisibleOnAnyMonitor(rect, [primary]), false);
});

test('keeps the stored position when monitors cannot be queried', () => {
  assert.equal(isVisibleOnAnyMonitor({ x: 2400, y: 100, width: 1000, height: 700 }, []), true);
});

test('requires enough of the window to stay reachable', () => {
  assert.equal(intersectsVisibleArea({ x: 1900, y: 100, width: 1000, height: 700 }, primary.workArea), false);
  assert.equal(intersectsVisibleArea({ x: 1800, y: 100, width: 1000, height: 700 }, primary.workArea), true);
});
