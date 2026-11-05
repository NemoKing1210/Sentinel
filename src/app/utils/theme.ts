import type { AccentPalette } from '@/app/constants';
import type { ColorScheme, ThemeMode } from '@/core/domain/types';

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

export function accentPaletteFromHex(hex: string, scheme: ColorScheme): AccentPalette {
  const teal = mixHex(hex, scheme === 'light' ? '#000000' : '#ffffff', scheme === 'light' ? 0.1 : 0.4);
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

export function resolveColorScheme(theme: ThemeMode): ColorScheme {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  return readSystemColorScheme();
}
