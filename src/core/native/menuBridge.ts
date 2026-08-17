import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { View } from '@/app/constants';

const MENU_EVENT = 'native:menu';

const MENU_TO_VIEW: Record<string, View | undefined> = {
  view_dashboard: 'dashboard',
  view_queue: 'queue',
  view_history: 'history',
  view_settings: 'settings',
};

interface MenuBridgeOptions {
  setView: (view: View) => void;
  pickFiles: () => Promise<void> | void;
  pickFolder: () => Promise<void> | void;
  showAbout: () => void;
}

export async function bindNativeMenu(options: MenuBridgeOptions): Promise<UnlistenFn> {
  return listen<string>(MENU_EVENT, (event) => {
    const id = event.payload;
    if (!id) return;
    const view = MENU_TO_VIEW[id];
    if (view) {
      options.setView(view);
      return;
    }
    if (id === 'pick_files') {
      void options.pickFiles();
      return;
    }
    if (id === 'pick_folder') {
      void options.pickFolder();
      return;
    }
    if (id === 'about') {
      options.showAbout();
    }
  });
}

export async function focusMainWindow(): Promise<void> {
  const window = getCurrentWindow();
  await window.show();
  await window.unminimize();
  await window.setFocus();
}
