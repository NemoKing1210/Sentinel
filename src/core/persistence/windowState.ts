import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { useAppStore, type WindowState } from '@/core/state/store';
import { isMinimizedWindowPosition, isVisibleOnAnyMonitor } from '@/app/utils/windowBounds';
import { logInfo } from '@/core/logging';

const SAVE_DELAY_MS = 400;
const MIN_WINDOW_SIZE = 200;
const FALLBACK_WIDTH = 1320;
const FALLBACK_HEIGHT = 860;
let timer: ReturnType<typeof setTimeout> | undefined;

async function snapshot(): Promise<WindowState | null> {
  const window = getCurrentWindow();
  try {
    const [size, position, maximized, minimized] = await Promise.all([
      window.outerSize(),
      window.outerPosition(),
      window.isMaximized(),
      window.isMinimized(),
    ]);
    // Minimized windows sit at the Windows sentinel position; saving it would
    // restore the window off-screen on the next launch.
    if (minimized || isMinimizedWindowPosition(position.x, position.y)) {
      return null;
    }
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
    let recenter = false;
    if (typeof stored.x === 'number' && typeof stored.y === 'number') {
      if (isMinimizedWindowPosition(stored.x, stored.y)) {
        recenter = true;
        logInfo('window_state.position_skipped_minimized', { x: stored.x, y: stored.y });
      } else {
        const width = stored.width > MIN_WINDOW_SIZE ? stored.width : FALLBACK_WIDTH;
        const height = stored.height > MIN_WINDOW_SIZE ? stored.height : FALLBACK_HEIGHT;
        const monitors = await availableMonitors().catch(() => []);
        if (isVisibleOnAnyMonitor({ x: stored.x, y: stored.y, width, height }, monitors)) {
          await window.setPosition(new PhysicalPosition(stored.x, stored.y));
        } else {
          recenter = true;
          logInfo('window_state.position_off_screen', { x: stored.x, y: stored.y });
        }
      }
    }
    if (stored.width > MIN_WINDOW_SIZE && stored.height > MIN_WINDOW_SIZE) {
      await window.setSize(new PhysicalSize(stored.width, stored.height));
    }
    if (recenter) {
      await window.center().catch((error) => logInfo('window_state.recenter_failed', { error: String(error) }));
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
  const unlistenResize = window.onResized(handler);
  const unlistenMove = window.onMoved(handler);
  return () => {
    void unlistenResize.then((fn) => fn());
    void unlistenMove.then((fn) => fn());
    if (timer) clearTimeout(timer);
  };
}
