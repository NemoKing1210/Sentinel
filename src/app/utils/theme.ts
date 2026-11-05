import type { AccentPalette } from '@/app/constants';
import type { ColorScheme } from '@/core/domain/types';

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** Mixes a 6-digit hex color toward `tint`, where `tintWeight` is 0–1. */
export function mixHex(base: string, tint: string, tintWeight: number): string {
  const baseRgb = parseHex(base);
  const tintRgb = parseHex(tint);
  if (!baseRgb || !tintRgb) return base;
  const weight = Math.min(1, Math.max(0, tintWeight));
  const channel = (index: number) => {
    const value = baseRgb[index] * (1 - weight) + tintRgb[index] * weight;
    return Math.round(value).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export function relativeLuminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function onAccentFor(color: string): '#000000' | '#ffffff' {
  const luminance = relativeLuminance(color);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff';
}

const THEME_BACKGROUND: Record<ColorScheme, string> = {
  light: '#f3f3f3',
  dark: '#202020',
};

const MIN_TEXT_CONTRAST = 4.5;

function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

/** The accent is also used as text, so keep it readable against the theme background. */
function ensureAccentContrast(hex: string, scheme: ColorScheme): string {
  const background = THEME_BACKGROUND[scheme];
  const target = scheme === 'light' ? '#000000' : '#ffffff';
  let color = hex;
  for (let step = 0; step < 20 && contrastRatio(color, background) < MIN_TEXT_CONTRAST; step += 1) {
    color = mixHex(color, target, 0.08);
  }
  return color;
}

export function accentPaletteFromHex(hex: string, scheme: ColorScheme): AccentPalette {
  const mixed = mixHex(hex, scheme === 'light' ? '#000000' : '#ffffff', scheme === 'light' ? 0.1 : 0.4);
  const teal = ensureAccentContrast(mixed, scheme);
  return {
    teal,
    tealDeep: mixHex(teal, '#000000', 0.12),
    onTeal: onAccentFor(teal),
  };
}

export function readSystemColorScheme(): ColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
