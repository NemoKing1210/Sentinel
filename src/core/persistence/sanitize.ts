import type { ScanItem } from '../domain/types';

/**
 * Turns runtime-only scan states into a persisted shape: work that was running
 * when the app stopped is marked interrupted, and a rate-limit wait becomes a
 * plain queued item. The scheduler decides what may start again.
 */
export function sanitizeItems(items: ScanItem[]): ScanItem[] {
  return items.map((item) => {
    if (item.status === 'waiting') {
      return { ...item, status: 'queued', retryAt: undefined, retryCount: undefined };
    }
    if (item.status === 'uploading' || item.status === 'scanning') {
      return { ...item, status: 'failed', progress: 0, error: 'interrupted_by_restart' };
    }
    return item;
  });
}
