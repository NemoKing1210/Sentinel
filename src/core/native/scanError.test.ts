import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScanError, toScanError } from './scanError.ts';

test('reads a serialized command error', () => {
  const error = toScanError({ code: 'rate_limited', message: 'slow down', retryAfterSecs: 7 });
  assert.ok(error instanceof ScanError);
  assert.equal(error.code, 'rate_limited');
  assert.equal(error.retryAfterSecs, 7);
});

test('falls back for unknown failures', () => {
  assert.equal(toScanError(new Error('boom')).code, 'other');
  assert.equal(toScanError('nope').message, 'nope');
});
