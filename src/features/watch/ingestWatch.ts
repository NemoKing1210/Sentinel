import type { ScanItem, WatchPendingFile, WatchRule } from '../../core/domain/types.ts';
import { watchFolderName } from '../../core/domain/watch.ts';
import { detectFileKind, detectMimeType } from '../../app/utils/fileKind.ts';

const ACTIVE_STATUSES: ReadonlySet<ScanItem['status']> = new Set(['queued', 'waiting', 'uploading', 'scanning']);

function pathKey(watchId: string, path: string): string {
  const normalized = path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return `${watchId}\u0000${normalized}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

/** Turns durable detections into queued scan items; every pending id is acknowledged either way. */
export function planWatchIngest(
  pending: WatchPendingFile[],
  rules: WatchRule[],
  existing: ScanItem[],
): { items: ScanItem[]; ackIds: string[] } {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const seen = new Set(
    existing
      .filter((item) => item.watchId && ACTIVE_STATUSES.has(item.status))
      .map((item) => pathKey(item.watchId as string, item.path ?? item.name)),
  );
  const items: ScanItem[] = [];
  const ackIds: string[] = [];

  for (const file of pending) {
    ackIds.push(file.id);
    const rule = rulesById.get(file.watchId);
    if (!rule || !file.path) continue;
    const key = pathKey(file.watchId, file.path);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = fileName(file.path);
    items.push({
      id: crypto.randomUUID(),
      name,
      isFolder: false,
      path: file.path,
      size: file.size,
      type: detectMimeType(name),
      fileKind: detectFileKind(name),
      status: 'queued',
      progress: 0,
      createdAt: new Date(file.detectedAt * 1000).toISOString(),
      origin: 'watch',
      autoStart: true,
      watchId: file.watchId,
      watchName: watchFolderName(rule.path),
    });
  }

  return { items, ackIds };
}
