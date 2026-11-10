import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analysisPhase,
  normalizePollInterval,
  pollAttempts,
  pollProgress,
  DEFAULT_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
} from './scanPolling.ts';

test('normalizes the configured polling interval to milliseconds', () => {
  assert.equal(normalizePollInterval(5), 5000);
  assert.equal(normalizePollInterval(1), 1000);
  assert.equal(normalizePollInterval(60), 60000);
});

test('clamps out-of-range and invalid polling intervals', () => {
  assert.equal(normalizePollInterval(0.2), MIN_POLL_INTERVAL_MS);
  assert.equal(normalizePollInterval(120), MAX_POLL_INTERVAL_MS);
  assert.equal(normalizePollInterval(Number.NaN), DEFAULT_POLL_INTERVAL_MS);
});

test('computes at least one attempt for any timeout', () => {
  // A 5-minute budget with a 5 s cadence checks at t=0 and every 5 s, so the
  // final check lands on the 300 s mark instead of one interval early.
  assert.equal(pollAttempts(5000, 300000), 61);
  assert.equal(pollAttempts(5000, 1), 1);
  assert.equal(pollAttempts(0, 300000), 301);
});

test('maps analysis statuses to terminal phases', () => {
  assert.equal(analysisPhase('completed'), 'completed');
  assert.equal(analysisPhase('failed'), 'failed');
  assert.equal(analysisPhase('queued'), 'pending');
  assert.equal(analysisPhase(undefined), 'pending');
  assert.equal(analysisPhase(42), 'pending');
});

test('reports progress from 40 to 95 and never goes backwards', () => {
  assert.equal(pollProgress(0, 60), 40);
  assert.equal(pollProgress(60, 60), 95);
  let previous = -1;
  for (let attempt = 0; attempt <= 60; attempt += 1) {
    const progress = pollProgress(attempt, 60);
    assert.ok(progress >= previous);
    previous = progress;
  }
});
