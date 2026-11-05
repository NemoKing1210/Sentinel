import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { View } from '@/app/constants';

interface AppShortcutsOptions {
  onPickFiles: () => void;
  onPickFolder: () => void;
  onView: (view: View) => void;
}

const VIEW_SHORTCUTS: Record<string, View> = {
  '1': 'dashboard',
  '2': 'queue',
  '3': 'history',
  '4': 'settings',
};

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useAppShortcuts({ onPickFiles, onPickFolder, onView }: AppShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const key = event.key.toLowerCase();
      if (!event.shiftKey) {
        const view = VIEW_SHORTCUTS[key];
        if (view) {
          event.preventDefault();
          onView(view);
          return;
        }
      }

      if (key === 'o') {
        event.preventDefault();
        if (event.shiftKey) onPickFolder();
        else onPickFiles();
        return;
      }

      if (event.shiftKey || !isTauri()) return;
      if (key === 'm') {
        event.preventDefault();
        void getCurrentWindow().minimize();
      } else if (key === 'w') {
        event.preventDefault();
        void getCurrentWindow().close();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPickFiles, onPickFolder, onView]);
}
