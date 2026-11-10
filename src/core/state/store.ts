import { create } from 'zustand';
import type { AppSettings, FileReport, ScanItem, WatchRule, WatchStatus } from '../domain/types';
import { DEFAULT_SETTINGS } from '../../app/constants';

export interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

interface AppState {
  items: ScanItem[];
  history: FileReport[];
  settings: AppSettings;
  windowState: WindowState | null;
  watchedFolders: WatchRule[];
  watchStatuses: Record<string, WatchStatus>;
  hydrated: boolean;
  addItems: (items: ScanItem[]) => void;
  updateItem: (id: string, patch: Partial<ScanItem>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  clearCompletedItems: () => void;
  addReport: (report: FileReport) => void;
  removeReport: (id: string) => void;
  clearHistory: () => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setWindowState: (state: WindowState | null) => void;
  setHydrated: (hydrated: boolean) => void;
  addWatchFolder: (rule: WatchRule) => void;
  updateWatchFolder: (id: string, patch: Partial<WatchRule>) => void;
  removeWatchFolder: (id: string) => void;
  setWatchStatuses: (statuses: Record<string, WatchStatus>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  items: [],
  history: [],
  settings: DEFAULT_SETTINGS,
  windowState: null,
  watchedFolders: [],
  watchStatuses: {},
  hydrated: false,
  addItems: (items) => set((state) => ({ items: [...items, ...state.items] })),
  updateItem: (id, patch) =>
    set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clearItems: () => set({ items: [] }),
  clearCompletedItems: () =>
    set((state) => ({
      items: state.items.filter((item) => item.status !== 'completed' && item.status !== 'failed'),
    })),
  addReport: (report) =>
    set((state) => ({ history: [report, ...state.history.filter((item) => item.itemId !== report.itemId)] })),
  removeReport: (id) => set((state) => ({ history: state.history.filter((item) => item.itemId !== id) })),
  clearHistory: () => set({ history: [] }),
  setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
  setWindowState: (windowState) => set({ windowState }),
  setHydrated: (hydrated) => set({ hydrated }),
  addWatchFolder: (rule) => set((state) => ({ watchedFolders: [...state.watchedFolders, rule] })),
  updateWatchFolder: (id, patch) =>
    set((state) => ({
      watchedFolders: state.watchedFolders.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    })),
  removeWatchFolder: (id) =>
    set((state) => {
      const watchStatuses = { ...state.watchStatuses };
      delete watchStatuses[id];
      return { watchedFolders: state.watchedFolders.filter((rule) => rule.id !== id), watchStatuses };
    }),
  setWatchStatuses: (watchStatuses) => set({ watchStatuses }),
}));
