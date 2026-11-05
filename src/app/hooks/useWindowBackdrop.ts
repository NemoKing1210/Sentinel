import { useEffect, useState } from 'react';
import { Effect, getCurrentWindow } from '@tauri-apps/api/window';
import type { ColorScheme } from '@/core/domain/types';
import { getWindowBackdrop } from '@/core/native/api';

export type BackdropMode = 'mica' | 'solid';

const LIGHT_WINDOW_BG = '#f3f3f3';
const DARK_WINDOW_BG = '#202020';

let micaSupport: Promise<boolean> | undefined;

function supportsMica(): Promise<boolean> {
  micaSupport ??= getWindowBackdrop()
    .then((info) => info.mica)
    .catch(() => false);
  return micaSupport;
}

function micaEffect(scheme: ColorScheme): Effect {
  return scheme === 'light' ? ('micaLight' as Effect) : ('micaDark' as Effect);
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useWindowBackdrop(scheme: ColorScheme): BackdropMode {
  const [mode, setMode] = useState<BackdropMode>('solid');

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    const nativeWindow = getCurrentWindow();

    void (async () => {
      const supported = await supportsMica();
      if (supported) {
        try {
          await nativeWindow.setEffects({ effects: [micaEffect(scheme)] });
          if (active) setMode('mica');
          return;
        } catch {
          // Mica can be refused under remote sessions or unsupported DWM states.
        }
      }

      await nativeWindow.clearEffects().catch(() => undefined);
      await nativeWindow
        .setBackgroundColor(scheme === 'light' ? LIGHT_WINDOW_BG : DARK_WINDOW_BG)
        .catch(() => undefined);
      if (active) setMode('solid');
    })();

    return () => {
      active = false;
    };
  }, [scheme]);

  return mode;
}
