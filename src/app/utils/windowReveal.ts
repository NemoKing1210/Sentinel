/** A context-menu scan must show the window, even when "start minimized" is on. */
export function shouldRevealWindow(startMinimized: boolean, hasPendingPaths: boolean): boolean {
  return hasPendingPaths || !startMinimized;
}

export function shouldStartHidden(startMinimized: boolean, hasPendingPaths: boolean): boolean {
  return !shouldRevealWindow(startMinimized, hasPendingPaths);
}
