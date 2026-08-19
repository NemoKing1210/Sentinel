import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ColorScheme, ThemeMode } from '@/core/domain/types';
import { readSystemColorScheme } from '@/app/utils/theme';

const LIGHT_WINDOW_BG = '#f8faf7';
const DARK_WINDOW_BG = '#111716';

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
    const nativeWindow = getCurrentWindow();
    const nativeTheme = theme === 'system' ? null : scheme;
    void Promise.all([
      nativeWindow.setBackgroundColor(scheme === 'light' ? LIGHT_WINDOW_BG : DARK_WINDOW_BG),
      nativeWindow.setTheme(nativeTheme),
    ]).catch(() => undefined);
  }, [theme, scheme]);

  return scheme;
}
