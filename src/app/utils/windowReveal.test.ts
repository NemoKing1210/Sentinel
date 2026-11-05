import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldRevealWindow, shouldStartHidden } from './windowReveal.ts';

test('reveals the window for a context-menu scan even when start minimized is on', () => {
  assert.equal(shouldRevealWindow(true, true), true);
  assert.equal(shouldStartHidden(true, true), false);
});

test('starts hidden when minimized is on and no scan is pending', () => {
  assert.equal(shouldRevealWindow(true, false), false);
  assert.equal(shouldStartHidden(true, false), true);
});

test('always shows the window when start minimized is off', () => {
  assert.equal(shouldRevealWindow(false, false), true);
  assert.equal(shouldRevealWindow(false, true), true);
  assert.equal(shouldStartHidden(false, false), false);
  assert.equal(shouldStartHidden(false, true), false);
});
