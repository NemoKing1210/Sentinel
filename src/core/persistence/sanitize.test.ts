import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScanItem } from '../domain/types.ts';
import { sanitizeItems } from './sanitize.ts';

function makeItem(patch: Partial<ScanItem>): ScanItem {
  return {
    id: 'item',
    name: 'file.bin',
    path: 'C:\\file.bin',
    size: 10,
    type: 'application/octet-stream',
    fileKind: 'executable',
    status: 'queued',
    progress: 0,
    createdAt: '2026-11-10T00:00:00.000Z',
    ...patch,
  };
}

test('requeues waiting items and clears retry state', () => {
  const [item] = sanitizeItems([
    makeItem({ status: 'waiting', retryAt: '2026-11-10T00:01:00.000Z', retryCount: 2, autoStart: true }),
  ]);
  assert.equal(item.status, 'queued');
  assert.equal(item.retryAt, undefined);
  assert.equal(item.retryCount, undefined);
  assert.equal(item.autoStart, true);
});

test('marks uploads interrupted by a restart as failed', () => {
  for (const status of ['uploading', 'scanning'] as const) {
    const [item] = sanitizeItems([makeItem({ status, progress: 40 })]);
    assert.equal(item.status, 'failed');
    assert.equal(item.progress, 0);
    assert.equal(item.error, 'interrupted_by_restart');
  }
});

test('leaves completed and queued items untouched', () => {
  const items = [makeItem({ id: 'a', status: 'completed' }), makeItem({ id: 'b', status: 'queued' })];
  assert.deepEqual(sanitizeItems(items), items);
});
