import type { ColorScheme } from '@/core/domain/types';
import type { AccentPalette } from '@/app/constants';
import { accentPaletteFromHex } from './theme';

export const SYSTEM_ACCENT_FALLBACK = '#0078d4';

/** Sentinel follows the Windows accent; the fallback covers hosts without one. */
export function resolveSystemAccentPalette(systemAccent: string | null, scheme: ColorScheme): AccentPalette {
  return accentPaletteFromHex(systemAccent ?? SYSTEM_ACCENT_FALLBACK, scheme);
}
