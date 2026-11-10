import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScanItem } from '../../core/domain/types.ts';
import { ScanError } from '../../core/native/scanError.ts';
import { nextStartWaitMs, retryDelaySeconds, scanResumePhase, selectNextScan } from './scanScheduler.ts';

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

test('resumes polling when an analysis id is stored', () => {
  assert.equal(scanResumePhase({ analysisId: 'a' }), 'poll');
  assert.equal(scanResumePhase({}), 'submit');
});

test('selects manual before watch and only auto-start items', () => {
  const watch = makeItem({ id: 'w', origin: 'watch', autoStart: true, createdAt: '2026-01-01T00:00:00Z' });
  const manual = makeItem({ id: 'm', origin: 'manual', autoStart: true, createdAt: '2026-01-02T00:00:00Z' });
  const idle = makeItem({ id: 'i', origin: 'manual', autoStart: false });
  assert.equal(selectNextScan([watch, manual, idle])?.id, 'm');
  assert.equal(selectNextScan([idle]), null);
});

test('waits until the delay elapses', () => {
  assert.equal(nextStartWaitMs(1000, 2000, 15), 14000);
  assert.equal(nextStartWaitMs(1000, 20000, 15), 0);
  assert.equal(nextStartWaitMs(undefined, 20000, 15), 0);
});

test('uses Retry-After or exponential delays', () => {
  assert.equal(retryDelaySeconds(new ScanError('rate_limited', 'x', 42), 1), 42);
  assert.equal(retryDelaySeconds(new ScanError('rate_limited', 'x'), 1), 30);
  assert.equal(retryDelaySeconds(new ScanError('rate_limited', 'x'), 3), 120);
  assert.equal(retryDelaySeconds(new ScanError('rate_limited', 'x', 999999), 1), 3600);
});
