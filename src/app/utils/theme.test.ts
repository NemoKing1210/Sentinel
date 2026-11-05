import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentPaletteFromHex, mixHex, resolveColorScheme } from './theme.ts';

test('keeps an explicit light or dark theme', () => {
  assert.equal(resolveColorScheme('light'), 'light');
  assert.equal(resolveColorScheme('dark'), 'dark');
});

test('falls back to dark for system theme when the host has no color scheme', () => {
  assert.equal(resolveColorScheme('system'), 'dark');
});

test('mixes an accent tint into the window background', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#111716', '#a4e6d9', 0), '#111716');
  assert.equal(mixHex('#111716', '#a4e6d9', 1), '#a4e6d9');
});

test('returns the base color when a hex value is invalid', () => {
  assert.equal(mixHex('#111716', 'not-a-color', 0.03), '#111716');
});

test('derives a readable dark palette from the Windows accent', () => {
  assert.deepEqual(accentPaletteFromHex('#0078d4', 'dark'), {
    teal: '#66aee5',
    tealDeep: '#5a99ca',
    onTeal: '#000000',
  });
});

test('derives a readable light palette from the Windows accent', () => {
  assert.deepEqual(accentPaletteFromHex('#0078d4', 'light'), {
    teal: '#006cbf',
    tealDeep: '#005fa8',
    onTeal: '#ffffff',
  });
});

test('keeps text readable on extreme accent values', () => {
  assert.equal(accentPaletteFromHex('#ffffff', 'dark').onTeal, '#000000');
  assert.equal(accentPaletteFromHex('#000000', 'light').onTeal, '#ffffff');
});
