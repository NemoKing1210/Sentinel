import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveColorScheme } from './theme.ts';

test('keeps an explicit light or dark theme', () => {
  assert.equal(resolveColorScheme('light'), 'light');
  assert.equal(resolveColorScheme('dark'), 'dark');
});

test('falls back to dark for system theme when the host has no color scheme', () => {
  assert.equal(resolveColorScheme('system'), 'dark');
});
