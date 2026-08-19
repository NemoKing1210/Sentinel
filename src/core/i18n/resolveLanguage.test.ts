import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveLanguageFromLocales } from './resolveLanguage.ts';

test('uses the first supported primary language tag', () => {
  assert.equal(resolveLanguageFromLocales(['ru-RU', 'en-US']), 'ru');
  assert.equal(resolveLanguageFromLocales(['pt_BR']), 'pt');
  assert.equal(resolveLanguageFromLocales(['zh-Hans-CN']), 'zh');
  assert.equal(resolveLanguageFromLocales(['fr']), 'fr');
});

test('walks the locale list until a supported language is found', () => {
  assert.equal(resolveLanguageFromLocales(['uk-UA', 'de-DE', 'en']), 'de');
});

test('falls back to English when no locale is supported', () => {
  assert.equal(resolveLanguageFromLocales([]), 'en');
  assert.equal(resolveLanguageFromLocales(['uk-UA', 'be-BY']), 'en');
  assert.equal(resolveLanguageFromLocales(['  ', 'not-a-locale']), 'en');
});
