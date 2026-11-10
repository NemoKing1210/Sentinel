import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeExtension, sanitizeWatchedFolders, watchPathsOverlap } from './watch.ts';

test('normalizes extensions to lowercase without a leading dot', () => {
  assert.equal(normalizeExtension('.TXT'), 'txt');
  assert.equal(normalizeExtension(' Mp4 '), 'mp4');
  assert.equal(normalizeExtension('bad/path'), null);
  assert.equal(normalizeExtension(''), null);
});

test('sanitizes rules and applies defaults', () => {
  const [rule] = sanitizeWatchedFolders([
    { id: 'a', path: 'C:\\Temp', includeExtensions: ['.TXT', 'bad/x'], maxDepth: 0, notify: 'nope' },
  ]);
  assert.equal(rule.id, 'a');
  assert.deepEqual(rule.includeExtensions, ['txt']);
  assert.equal(rule.maxDepth, null);
  assert.equal(rule.notify, 'threats');
  assert.equal(rule.settleMs, 1500);
});

test('detects nested and case-insensitive paths', () => {
  assert.equal(watchPathsOverlap('C:\\Root', 'c:/root/sub'), true);
  assert.equal(watchPathsOverlap('C:\\Root', 'C:\\Root2'), false);
});

test('drops rules without id or path and duplicates ids', () => {
  assert.deepEqual(sanitizeWatchedFolders(null), []);
  assert.equal(sanitizeWatchedFolders([{ path: 'C:\\A' }, { id: 'x' }]).length, 0);
  assert.equal(
    sanitizeWatchedFolders([
      { id: 'x', path: 'C:\\A' },
      { id: 'x', path: 'C:\\B' },
    ]).length,
    1,
  );
  assert.equal(
    sanitizeWatchedFolders([
      { id: 'a', path: 'C:\\Root' },
      { id: 'b', path: 'C:\\Root\\Sub' },
    ]).length,
    1,
  );
});
