import type { AccentColor, ColorScheme } from '@/core/domain/types';
import { getAccentPalette, type AccentPalette } from '@/app/constants';
import { accentPaletteFromHex } from './theme';

export const SYSTEM_ACCENT_FALLBACK = '#0078d4';

export function resolveAccentPalette(
  accent: AccentColor,
  scheme: ColorScheme,
  systemAccent: string | null,
): AccentPalette {
  if (accent === 'system') return accentPaletteFromHex(systemAccent ?? SYSTEM_ACCENT_FALLBACK, scheme);
  return getAccentPalette(accent, scheme);
}
