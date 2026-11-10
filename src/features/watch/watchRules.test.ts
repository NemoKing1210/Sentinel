import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TFunction } from 'i18next';
import {
  createWatchRule,
  isOverlappingPath,
  normalizeExtensionList,
  parseExtensionInput,
  shouldNotifyWatch,
  validateWatchDraft,
  watchRuleSummary,
} from './watchRules.ts';

test('creates a rule with defaults', () => {
  const rule = createWatchRule('C:\\Downloads', 'id-1');
  assert.equal(rule.enabled, true);
  assert.equal(rule.maxDepth, null);
  assert.equal(rule.notify, 'threats');
  assert.equal(rule.id, 'id-1');
});

test('rejects empty paths, duplicates and nested folders', () => {
  const base = createWatchRule('C:\\Downloads', 'a');
  assert.equal(validateWatchDraft(createWatchRule('', 'b'), [base]), 'watchErrorPathMissing');
  assert.equal(validateWatchDraft(base, [base]), 'watchErrorDuplicate');
  assert.equal(validateWatchDraft(createWatchRule('C:\\Downloads\\Sub', 'b'), [base]), 'watchErrorOverlap');
  assert.equal(validateWatchDraft(base, []), null);
});

test('rejects invalid depth and size limits', () => {
  const base = createWatchRule('C:\\Downloads', 'a');
  assert.equal(validateWatchDraft({ ...base, maxDepth: 0 }, []), 'watchErrorDepth');
  assert.equal(validateWatchDraft({ ...base, maxDepth: 65 }, []), 'watchErrorDepth');
  assert.equal(validateWatchDraft({ ...base, maxDepth: 64 }, []), null);
  assert.equal(validateWatchDraft({ ...base, maxSizeBytes: 0 }, []), 'watchErrorSize');
  assert.equal(validateWatchDraft({ ...base, minSizeBytes: 10, maxSizeBytes: 5 }, []), 'watchErrorSize');
});

test('parses and normalizes extension input', () => {
  assert.deepEqual(parseExtensionInput('txt, .MP4  bad/x, exe'), ['txt', 'mp4', 'exe']);
  assert.deepEqual(normalizeExtensionList(['.TXT', 'txt', 'mp4']), ['txt', 'mp4']);
  assert.equal(isOverlappingPath('C:\\Root', 'c:/root/sub'), true);
  assert.equal(isOverlappingPath('C:\\Root', 'C:\\Root2'), false);
});

test('summarizes a rule', () => {
  const t = ((key: string) => key) as TFunction;
  const summary = watchRuleSummary(createWatchRule('C:\\Downloads', 'a'), t);
  assert.ok(summary.length >= 3);
});

test('gates notifications by verdict', () => {
  const rule = createWatchRule('C:\\Downloads', 'a');
  assert.equal(shouldNotifyWatch({ ...rule, notify: 'threats' }, 'malicious'), true);
  assert.equal(shouldNotifyWatch({ ...rule, notify: 'threats' }, 'suspicious'), true);
  assert.equal(shouldNotifyWatch({ ...rule, notify: 'threats' }, 'clean'), false);
  assert.equal(shouldNotifyWatch({ ...rule, notify: 'all' }, 'clean'), true);
  assert.equal(shouldNotifyWatch({ ...rule, notify: 'none' }, 'malicious'), false);
});
