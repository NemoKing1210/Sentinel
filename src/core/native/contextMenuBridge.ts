import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getPendingScanPaths } from './api';

const CONTEXT_SCAN_EVENT = 'native:context-scan';

interface ContextMenuBridgeOptions {
  onPaths: (paths: string[]) => void;
}

/**
 * The event only wakes the UI. Paths live in a Rust-side queue so a scan
 * requested while the webview was still loading is not lost.
 */
export async function bindContextMenuScans(options: ContextMenuBridgeOptions): Promise<UnlistenFn> {
  return listen(CONTEXT_SCAN_EVENT, () => {
    void getPendingScanPaths()
      .then((paths) => {
        if (paths.length) options.onPaths(paths);
      })
      .catch(() => undefined);
  });
}
