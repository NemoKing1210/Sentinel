import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ColorScheme, ThemeMode } from '@/core/domain/types';
import { readSystemColorScheme } from '@/app/utils/theme';

export function useNativeTheme(theme: ThemeMode): ColorScheme {
  const [osScheme, setOsScheme] = useState(readSystemColorScheme);
  const scheme: ColorScheme = theme === 'light' || theme === 'dark' ? theme : osScheme;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setOsScheme(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    const nativeWindow = getCurrentWindow();
    const nativeTheme = theme === 'system' ? null : scheme;
    void nativeWindow.setTheme(nativeTheme).catch(() => undefined);
  }, [theme, scheme]);

  return scheme;
}
