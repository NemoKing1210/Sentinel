import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { useAppStore, type WindowState } from '@/core/state/store';
import { logInfo } from '@/core/logging';

const SAVE_DELAY_MS = 400;
let timer: ReturnType<typeof setTimeout> | undefined;

async function snapshot(): Promise<WindowState | null> {
  const window = getCurrentWindow();
  try {
    const [size, position, maximized] = await Promise.all([
      window.outerSize(),
      window.outerPosition(),
      window.isMaximized(),
    ]);
    return {
      width: size.width,
      height: size.height,
      x: position.x,
      y: position.y,
      maximized,
    };
  } catch (error) {
    logInfo('window_state.snapshot_failed', { error: String(error) });
    return null;
  }
}

function scheduleSnapshot(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const next = await snapshot();
    if (next) useAppStore.getState().setWindowState(next);
  }, SAVE_DELAY_MS);
}

export async function applyPersistedWindowState(): Promise<void> {
  const stored = useAppStore.getState().windowState;
  if (!stored) return;
  const window = getCurrentWindow();
  try {
    if (typeof stored.x === 'number' && typeof stored.y === 'number') {
      await window.setPosition(new PhysicalPosition(stored.x, stored.y));
    }
    if (stored.width > 200 && stored.height > 200) {
      await window.setSize(new PhysicalSize(stored.width, stored.height));
    }
    if (stored.maximized) {
      await window.maximize();
    }
    logInfo('window_state.restored', { width: stored.width, height: stored.height });
  } catch (error) {
    logInfo('window_state.restore_failed', { error: String(error) });
  }
}

export function subscribeWindowState(): () => void {
  const window = getCurrentWindow();
  const handler = () => scheduleSnapshot();
  const unlisten = window.onResized(handler);
  const unlistenMove = window.onMoved(handler);
  const unlistenMaximize = window.onResized(handler);
  return () => {
    void unlisten.then((fn) => fn());
    void unlistenMove.then((fn) => fn());
    void unlistenMaximize.then((fn) => fn());
    if (timer) clearTimeout(timer);
  };
}
