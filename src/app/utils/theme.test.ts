import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentPaletteFromHex, mixHex, relativeLuminance, resolveColorScheme } from './theme.ts';

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

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

test('keeps a bright accent readable as text on the light background', () => {
  const palette = accentPaletteFromHex('#ffeb3b', 'light');
  assert.ok(contrast(palette.teal, '#f3f3f3') >= 4.5, `contrast was ${contrast(palette.teal, '#f3f3f3')}`);
});

test('keeps a dark accent readable as text on the dark background', () => {
  const palette = accentPaletteFromHex('#000000', 'dark');
  assert.ok(contrast(palette.teal, '#202020') >= 4.5, `contrast was ${contrast(palette.teal, '#202020')}`);
});

test('leaves already readable accents unchanged', () => {
  assert.equal(accentPaletteFromHex('#0078d4', 'dark').teal, '#66aee5');
  assert.equal(accentPaletteFromHex('#0078d4', 'light').teal, '#006cbf');
});
