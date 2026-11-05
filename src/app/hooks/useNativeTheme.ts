import { useEffect, useState } from 'react';
import type { ColorScheme } from '@/core/domain/types';
import { readSystemColorScheme } from '@/app/utils/theme';

/** Sentinel always follows the Windows light/dark setting. */
export function useNativeTheme(): ColorScheme {
  const [scheme, setScheme] = useState(readSystemColorScheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setScheme(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return scheme;
}
