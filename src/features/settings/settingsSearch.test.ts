import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  highlightSegments,
  normalizeSearchText,
  searchSettings,
  tokenizeSearch,
  type SettingsSearchItem,
  type SettingsSearchSection,
} from './settingsSearch.ts';

const sections: SettingsSearchSection[] = [
  { id: 'appearance', title: 'Appearance', description: 'Theme and language' },
  { id: 'scan', title: 'Scanning', description: 'Uploads and polling' },
  { id: 'notifications', title: 'Notifications' },
];

const items: SettingsSearchItem[] = [
  { id: 'language', section: 'appearance', title: 'Language', description: 'Interface language for Sentinel.' },
  {
    id: 'apiKey',
    section: 'scan',
    title: 'API key',
    description: 'Stored securely in the keychain.',
    keywords: ['virustotal', 'token'],
  },
  { id: 'logLevel', section: 'scan', title: 'Log level', description: 'Detail level of diagnostic logs.' },
  { id: 'closeToTray', section: 'notifications', title: 'Keep in tray when closed', keywords: ['background'] },
];

test('normalizes case, punctuation and diacritics', () => {
  assert.equal(normalizeSearchText('  Éinstellungen & Sprache! '), 'einstellungen sprache');
  assert.deepEqual(tokenizeSearch('API-key  API'), ['api', 'key']);
});

test('an empty query keeps every setting', () => {
  const result = searchSettings(sections, items, '   ');
  assert.equal(result.active, false);
  assert.equal(result.count, items.length);
  assert.equal(result.items.size, 0);
});

test('matches titles and descriptions case-insensitively', () => {
  const result = searchSettings(sections, items, 'LANGUAGE');
  assert.equal(result.items.has('language'), true);
  assert.equal(result.count, 1);
});

test('matches compact technical terms and keywords', () => {
  const compact = searchSettings(sections, items, 'apikey');
  assert.equal(compact.items.has('apiKey'), true);

  const keyword = searchSettings(sections, items, 'virustotal');
  assert.equal(keyword.items.has('apiKey'), true);
});

test('requires every token to match', () => {
  const result = searchSettings(sections, items, 'api token');
  assert.equal(result.items.has('apiKey'), true);
  assert.equal(searchSettings(sections, items, 'api language').count, 0);
});

test('fuzzy matches long words', () => {
  const result = searchSettings(sections, items, 'lvl');
  assert.equal(result.items.has('logLevel'), true);
});

test('matches inflected word forms with a light stem', () => {
  const inflected = [{ id: 'tray', section: 'notifications', title: 'Оставлять в трее при закрытии' }];
  assert.equal(searchSettings(sections, inflected, 'трей').items.has('tray'), true);
});

test('a matching section reveals all of its settings', () => {
  const result = searchSettings(sections, items, 'scanning');
  assert.equal(result.items.has('apiKey'), true);
  assert.equal(result.items.has('logLevel'), true);
  assert.equal(result.items.has('language'), false);
  assert.equal(result.count, 2);
});

test('reports no matches', () => {
  const result = searchSettings(sections, items, 'quantum');
  assert.equal(result.active, true);
  assert.equal(result.count, 0);
  assert.equal(result.sections.size, 0);
});

test('highlights literal hits and preserves the original text', () => {
  const segments = highlightSegments('Interface language for Sentinel.', ['lang']);
  assert.deepEqual(segments, [
    { text: 'Interface ', match: false },
    { text: 'lang', match: true },
    { text: 'uage for Sentinel.', match: false },
  ]);
});

test('merges overlapping highlight ranges', () => {
  const segments = highlightSegments('Scanning settings', ['scan', 'scann']);
  assert.deepEqual(segments, [
    { text: 'Scann', match: true },
    { text: 'ing settings', match: false },
  ]);
});
