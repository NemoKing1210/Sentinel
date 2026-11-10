import type { AppSettings, FileReport, ScanItem, WatchRule } from '@/core/domain/types';

export interface PersistableState {
  items: ScanItem[];
  history: FileReport[];
  settings: AppSettings;
  watchedFolders: WatchRule[];
  windowState: unknown;
}

/** True when a reference that reaches `state.json` changed since the previous store snapshot. */
export function persistenceChanged(previous: PersistableState, next: PersistableState): boolean {
  return (
    previous.items !== next.items ||
    previous.history !== next.history ||
    previous.settings !== next.settings ||
    previous.watchedFolders !== next.watchedFolders ||
    previous.windowState !== next.windowState
  );
}
