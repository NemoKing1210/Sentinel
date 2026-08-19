import { useEffect, useState } from 'react';
import { getFileIcon } from '@/core/native/api';

export function useFileIcon(path: string | undefined): string | null {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    getFileIcon(path)
      .then((result) => {
        if (!cancelled) setIcon(result);
      })
      .catch(() => {
        if (!cancelled) setIcon(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return icon;
}
