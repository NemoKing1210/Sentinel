import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppSettings } from '../../core/domain/types.ts';
import type { PersistableState } from './persistTrigger.ts';
import { persistenceChanged } from './persistTrigger.ts';

const EMPTY_STATE: PersistableState = {
  items: [],
  history: [],
  settings: {} as AppSettings,
  watchedFolders: [],
  windowState: null,
};

function makeState(patch: Partial<PersistableState> = {}): PersistableState {
  return { ...EMPTY_STATE, ...patch };
}

test('saves when watched folders change', () => {
  const previous = makeState();
  const next = makeState({
    watchedFolders: [
      {
        id: 'w',
        path: 'C:\\Downloads',
        enabled: true,
        maxDepth: null,
        includeExtensions: [],
        excludeExtensions: [],
        ignoreHidden: true,
        ignoreTemp: true,
        minSizeBytes: 0,
        maxSizeBytes: 1,
        settleMs: 1500,
        scanMissedWhileClosed: false,
        notify: 'threats',
      },
    ],
  });
  assert.equal(persistenceChanged(previous, next), true);
});

test('ignores state changes that are not persisted', () => {
  const previous = makeState();
  assert.equal(persistenceChanged(previous, makeState()), false);
});
