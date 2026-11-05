import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationModeForWidth, nextNavIndex } from './navigation.ts';

test('uses the WinUI NavigationView breakpoints', () => {
  assert.equal(navigationModeForWidth(1400), 'expanded');
  assert.equal(navigationModeForWidth(1008), 'expanded');
  assert.equal(navigationModeForWidth(1007), 'compact');
  assert.equal(navigationModeForWidth(641), 'compact');
  assert.equal(navigationModeForWidth(640), 'minimal');
  assert.equal(navigationModeForWidth(480), 'minimal');
});

test('wraps arrow navigation and supports Home/End', () => {
  assert.equal(nextNavIndex(0, 'ArrowDown', 4), 1);
  assert.equal(nextNavIndex(3, 'ArrowDown', 4), 0);
  assert.equal(nextNavIndex(0, 'ArrowUp', 4), 3);
  assert.equal(nextNavIndex(2, 'Home', 4), 0);
  assert.equal(nextNavIndex(2, 'End', 4), 3);
  assert.equal(nextNavIndex(0, 'ArrowDown', 0), 0);
});
