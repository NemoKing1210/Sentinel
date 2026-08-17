import { create } from 'zustand';
import type { AppSettings, FileReport, ScanItem } from '../domain/types';
import { DEFAULT_SETTINGS, type View } from '../../app/constants';

export interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

interface AppState {
  view: View;
  setView: (view: AppState['view']) => void;
  items: ScanItem[];
  history: FileReport[];
  selectedReportId: string | null;
  settings: AppSettings;
  windowState: WindowState | null;
  hydrated: boolean;
  addItems: (items: ScanItem[]) => void;
  updateItem: (id: string, patch: Partial<ScanItem>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  clearCompletedItems: () => void;
  setReport: (report: FileReport | null) => void;
  addReport: (report: FileReport) => void;
  removeReport: (id: string) => void;
  clearHistory: () => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setWindowState: (state: WindowState | null) => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  setView: (view) => set({ view }),
  items: [],
  history: [],
  selectedReportId: null,
  settings: DEFAULT_SETTINGS,
  windowState: null,
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
  setReport: (report) => set({ selectedReportId: report?.itemId ?? null }),
  addReport: (report) =>
    set((state) => ({ history: [report, ...state.history.filter((item) => item.itemId !== report.itemId)] })),
  removeReport: (id) =>
    set((state) => ({
      history: state.history.filter((item) => item.itemId !== id),
      selectedReportId: state.selectedReportId === id ? null : state.selectedReportId,
    })),
  clearHistory: () => set({ history: [], selectedReportId: null }),
  setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
  setWindowState: (windowState) => set({ windowState }),
  setHydrated: (hydrated) => set({ hydrated }),
}));
