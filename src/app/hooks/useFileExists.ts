import { useEffect, useState } from 'react';
import { fileExists } from '@/core/native/api';

export function useFileExists(path: string | undefined): boolean {
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    fileExists(path)
      .then((result) => {
        if (!cancelled) setExists(result);
      })
      .catch(() => {
        if (!cancelled) setExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return exists;
}
