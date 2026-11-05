import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getSystemAccent } from '@/core/native/api';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useSystemAccent(): string | null {
  const [accent, setAccent] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    let unlisten: (() => void) | undefined;

    const load = () => {
      void getSystemAccent()
        .then((value) => {
          if (active) setAccent(value);
        })
        .catch(() => undefined);
    };

    load();
    void getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        if (payload) load();
      })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return accent;
}
