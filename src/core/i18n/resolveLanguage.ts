import type { Language } from '@/core/domain/types';

export const FALLBACK_LANGUAGE: Language = 'en';

const SUPPORTED_LANGUAGES: Record<Language, true> = {
  en: true,
  ru: true,
  es: true,
  de: true,
  fr: true,
  pt: true,
  zh: true,
};

export function isAppLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in SUPPORTED_LANGUAGES;
}

function primaryLanguageTag(locale: string): string {
  return locale.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
}

export function resolveLanguageFromLocales(
  locales: readonly string[],
  fallback: Language = FALLBACK_LANGUAGE,
): Language {
  for (const locale of locales) {
    const primary = primaryLanguageTag(locale);
    if (isAppLanguage(primary)) {
      return primary;
    }
  }
  return fallback;
}

export function readSystemLocales(): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (locale: string | undefined) => {
    if (!locale || seen.has(locale)) {
      return;
    }
    seen.add(locale);
    ordered.push(locale);
  };

  if (typeof navigator !== 'undefined') {
    for (const locale of navigator.languages ?? []) {
      push(locale);
    }
    push(navigator.language);
  }

  if (ordered.length === 0 && typeof Intl !== 'undefined') {
    push(Intl.DateTimeFormat().resolvedOptions().locale);
  }

  return ordered;
}

export function detectPreferredLanguage(locales: readonly string[] = readSystemLocales()): Language {
  return resolveLanguageFromLocales(locales);
}
