export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorWorkArea {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface MonitorInfo {
  workArea: MonitorWorkArea;
}

/** Windows parks minimized windows at this position; it must never be persisted. */
export const MINIMIZED_WINDOW_SENTINEL = -30000;

const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 64;

export function isMinimizedWindowPosition(x: number, y: number): boolean {
  return x <= MINIMIZED_WINDOW_SENTINEL || y <= MINIMIZED_WINDOW_SENTINEL;
}

export function intersectsVisibleArea(rect: WindowRect, workArea: MonitorWorkArea): boolean {
  const left = Math.max(rect.x, workArea.position.x);
  const top = Math.max(rect.y, workArea.position.y);
  const right = Math.min(rect.x + rect.width, workArea.position.x + workArea.size.width);
  const bottom = Math.min(rect.y + rect.height, workArea.position.y + workArea.size.height);
  return right - left >= MIN_VISIBLE_WIDTH && bottom - top >= MIN_VISIBLE_HEIGHT;
}

/** True when enough of the window would land on a connected monitor to grab it. */
export function isVisibleOnAnyMonitor(rect: WindowRect, monitors: MonitorInfo[]): boolean {
  if (monitors.length === 0) return true;
  return monitors.some((monitor) => intersectsVisibleArea(rect, monitor.workArea));
}
