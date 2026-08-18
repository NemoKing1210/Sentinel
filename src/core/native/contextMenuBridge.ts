import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const CONTEXT_SCAN_EVENT = 'native:context-scan';

interface ContextMenuBridgeOptions {
  onPaths: (paths: string[]) => void;
}

export async function bindContextMenuScans(options: ContextMenuBridgeOptions): Promise<UnlistenFn> {
  return listen<{ paths: string[] }>(CONTEXT_SCAN_EVENT, (event) => {
    const paths = event.payload?.paths ?? [];
    if (paths.length) options.onPaths(paths);
  });
}
