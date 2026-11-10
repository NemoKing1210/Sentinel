import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScanItem } from '../../core/domain/types.ts';
import { planWatchIngest } from './ingestWatch.ts';
import { createWatchRule } from './watchRules.ts';

function makeItem(patch: Partial<ScanItem>): ScanItem {
  return {
    id: 'x',
    name: 'file.bin',
    path: 'C:\\file.bin',
    size: 1,
    type: 'application/octet-stream',
    fileKind: 'executable',
    status: 'queued',
    progress: 0,
    createdAt: '2026-01-01T00:00:00Z',
    origin: 'manual',
    autoStart: true,
    ...patch,
  };
}

test('builds queued watch items and acks every pending id', () => {
  const rule = createWatchRule('C:\\Downloads', 'w');
  const pending = [{ id: 'p1', watchId: 'w', path: 'C:\\Downloads\\a.exe', size: 10, modifiedAt: 1, detectedAt: 1 }];
  const plan = planWatchIngest(pending, [rule], []);
  assert.equal(plan.items[0].origin, 'watch');
  assert.equal(plan.items[0].autoStart, true);
  assert.equal(plan.items[0].watchName, 'Downloads');
  assert.equal(plan.items[0].status, 'queued');
  assert.equal(plan.items[0].size, 10);
  assert.deepEqual(plan.ackIds, ['p1']);
});

test('drops unknown rules and duplicate active paths', () => {
  const existing = [{ ...makeItem({ id: 'i' }), watchId: 'w', path: 'C:\\Downloads\\a.exe', autoStart: true }];
  const pending = [
    { id: 'p1', watchId: 'w', path: 'C:\\Downloads\\a.exe', size: 10, modifiedAt: 1, detectedAt: 1 },
    { id: 'p2', watchId: 'gone', path: 'C:\\X\\b.exe', size: 10, modifiedAt: 1, detectedAt: 1 },
  ];
  const plan = planWatchIngest(pending, [createWatchRule('C:\\Downloads', 'w')], existing);
  assert.equal(plan.items.length, 0);
  assert.deepEqual(plan.ackIds.sort(), ['p1', 'p2']);
});

test('deduplicates within one batch and ignores finished items', () => {
  const rule = createWatchRule('C:\\Downloads', 'w');
  const pending = [
    { id: 'p1', watchId: 'w', path: 'C:\\Downloads\\a.exe', size: 10, modifiedAt: 1, detectedAt: 1 },
    { id: 'p2', watchId: 'w', path: 'c:/downloads/A.EXE', size: 10, modifiedAt: 2, detectedAt: 2 },
  ];
  const finished = makeItem({ id: 'old', watchId: 'w', path: 'C:\\Downloads\\done.exe', status: 'completed' });
  const plan = planWatchIngest(pending, [rule], [finished]);
  assert.equal(plan.items.length, 1);
  assert.deepEqual(plan.ackIds, ['p1', 'p2']);
});
