import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ThemeMode } from '@/core/domain/types';

export function useNativeTheme(theme: ThemeMode) {
  useEffect(() => {
    const nativeWindow = getCurrentWindow();
    const nativeTheme = theme === 'light' ? 'light' : 'dark';
    void Promise.all([
      nativeWindow.setBackgroundColor(theme === 'light' ? '#f8faf7' : '#111716'),
      nativeWindow.setTheme(nativeTheme),
    ]).catch(() => undefined);
  }, [theme]);
}
