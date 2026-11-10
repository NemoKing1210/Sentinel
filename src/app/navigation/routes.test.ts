import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserPath, isBrowserPath, reportIdFromPath, reportPath, resolveView, viewPath } from './routes.ts';

test('builds paths for primary views', () => {
  assert.equal(viewPath('dashboard'), '/dashboard');
  assert.equal(viewPath('queue'), '/queue');
  assert.equal(viewPath('watch'), '/watch');
  assert.equal(viewPath('history'), '/history');
  assert.equal(viewPath('settings'), '/settings');
});

test('builds an encoded report path under history', () => {
  assert.equal(reportPath('abc-123'), '/history/abc-123');
  assert.equal(reportPath('id with/slash'), '/history/id%20with%2Fslash');
});

test('extracts the report id from a history detail path', () => {
  assert.equal(reportIdFromPath('/history/abc-123'), 'abc-123');
  assert.equal(reportIdFromPath('/history/id%20with%2Fslash'), 'id with/slash');
  assert.equal(reportIdFromPath('/history'), null);
  assert.equal(reportIdFromPath('/queue/abc'), null);
  assert.equal(reportIdFromPath('/history/'), null);
});

test('builds and detects the embedded report browser path', () => {
  assert.equal(browserPath('abc-123'), '/history/abc-123/browser');
  assert.equal(browserPath('id with/slash'), '/history/id%20with%2Fslash/browser');
  assert.equal(isBrowserPath('/history/abc-123/browser'), true);
  assert.equal(isBrowserPath('/history/abc-123'), false);
  assert.equal(isBrowserPath('/history'), false);
  assert.equal(isBrowserPath('/settings'), false);
});

test('resolves the active view from a pathname', () => {
  assert.equal(resolveView('/dashboard'), 'dashboard');
  assert.equal(resolveView('/history'), 'history');
  assert.equal(resolveView('/watch'), 'watch');
  assert.equal(resolveView('/history/abc-123'), 'history');
  assert.equal(resolveView('/history/abc-123/browser'), 'history');
  assert.equal(resolveView('/settings/'), 'settings');
  assert.equal(resolveView('/'), null);
  assert.equal(resolveView('/unknown'), null);
});
