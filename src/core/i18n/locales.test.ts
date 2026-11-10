import assert from 'node:assert/strict';
import { test } from 'node:test';
import de from './locales/de.ts';
import en from './locales/en.ts';
import es from './locales/es.ts';
import fr from './locales/fr.ts';
import pt from './locales/pt.ts';
import ru from './locales/ru.ts';
import zh from './locales/zh.ts';

const LOCALES = { en, ru, es, de, fr, pt, zh };
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function keys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const result: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      result.push(...keys(child, path));
    } else {
      result.push(path);
    }
  }
  return result;
}

function comparable(key: string): string {
  return key.replace(PLURAL_SUFFIX, '');
}

test('every locale exposes the same translation keys', () => {
  const reference = new Set(keys(en.translation).map(comparable));
  for (const [name, locale] of Object.entries(LOCALES)) {
    const actual = new Set(keys(locale.translation).map(comparable));
    const missing = [...reference].filter((key) => !actual.has(key));
    const extra = [...actual].filter((key) => !reference.has(key));
    assert.deepEqual(missing, [], `${name} is missing translation keys`);
    assert.deepEqual(extra, [], `${name} has translation keys that en does not`);
  }
});
