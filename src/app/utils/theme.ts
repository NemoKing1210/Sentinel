import type { ColorScheme, ThemeMode } from '@/core/domain/types';

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
