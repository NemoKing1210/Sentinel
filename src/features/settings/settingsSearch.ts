/**
 * Pure search helpers for the Settings screen.
 *
 * Matching is intentionally forgiving: case- and diacritic-insensitive,
 * space-insensitive ("apikey" finds "API key"), prefix-aware and, for words of
 * three or more characters, subsequence-tolerant so "lvl" finds "Log level".
 * Whole sections are searchable too: a hit on a section title reveals every
 * setting inside it.
 */

export interface SettingsSearchSection {
  id: string;
  title: string;
  description?: string;
  keywords?: readonly string[];
}

export interface SettingsSearchItem {
  id: string;
  section: string;
  title: string;
  description?: string;
  keywords?: readonly string[];
}

export interface SettingsSearchResult {
  /** True when the query contains at least one usable token. */
  active: boolean;
  /** Normalized tokens, reused for highlighting. */
  tokens: string[];
  /** Ids of settings that should stay visible. */
  items: ReadonlySet<string>;
  /** Ids of sections that should stay visible. */
  sections: ReadonlySet<string>;
  /** Number of matching settings. */
  count: number;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

interface PreparedText {
  normalized: string;
  compact: string;
  words: string[];
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenizeSearch(query: string): string[] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  return [...new Set(tokens)];
}

function prepare(value: string): PreparedText {
  const normalized = normalizeSearchText(value);
  return {
    normalized,
    compact: normalized.replace(/ /g, ''),
    words: normalized.split(' ').filter(Boolean),
  };
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function matchesToken(prepared: PreparedText, token: string): boolean {
  if (prepared.normalized.includes(token)) return true;
  if (prepared.compact.includes(token)) return true;
  // Short tokens stay literal so "on" does not match half the page.
  if (token.length < 3) return false;
  // Light stemming: "трей" finds "трее", "setting" finds "settings".
  if (token.length >= 4) {
    const stem = token.slice(0, -1);
    if (prepared.words.some((word) => word.startsWith(stem))) return true;
  }
  if (isSubsequence(token, prepared.compact)) return true;
  return prepared.words.some((word) => word.length > token.length && isSubsequence(token, word));
}

function matchesAll(prepared: PreparedText, tokens: readonly string[]): boolean {
  return tokens.every((token) => matchesToken(prepared, token));
}

function prepareSection(section: SettingsSearchSection): PreparedText {
  return prepare([section.title, section.description ?? '', ...(section.keywords ?? [])].join(' '));
}

function prepareItem(item: SettingsSearchItem): PreparedText {
  return prepare([item.title, item.description ?? '', ...(item.keywords ?? [])].join(' '));
}

/**
 * Filters settings for a query. All tokens must match (AND); a matching
 * section keeps all of its settings visible.
 */
export function searchSettings(
  sections: readonly SettingsSearchSection[],
  items: readonly SettingsSearchItem[],
  query: string,
): SettingsSearchResult {
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) {
    return {
      active: false,
      tokens: [],
      items: new Set(),
      sections: new Set(),
      count: items.length,
    };
  }

  const matchedSections = new Set<string>();
  for (const section of sections) {
    if (matchesAll(prepareSection(section), tokens)) matchedSections.add(section.id);
  }

  const matchedItems = new Set<string>();
  for (const item of items) {
    if (matchedSections.has(item.section) || matchesAll(prepareItem(item), tokens)) {
      matchedItems.add(item.id);
    }
  }

  const visibleSections = new Set<string>();
  for (const item of items) {
    if (matchedItems.has(item.id)) visibleSections.add(item.section);
  }

  return {
    active: true,
    tokens,
    items: matchedItems,
    sections: visibleSections,
    count: matchedItems.size,
  };
}

/**
 * Splits text into plain and matched segments for rendering highlights.
 * Only literal (case-insensitive) token hits are highlighted; fuzzy matches
 * still filter the list, they just do not paint a mark.
 */
export function highlightSegments(text: string, tokens: readonly string[]): HighlightSegment[] {
  if (!text || tokens.length === 0) return [{ text, match: false }];

  const lowered = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const index = lowered.indexOf(token, from);
      if (index === -1) break;
      ranges.push([index, index + token.length]);
      from = index + token.length;
    }
  }

  if (ranges.length === 0) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
