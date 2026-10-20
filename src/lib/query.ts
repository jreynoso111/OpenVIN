/**
 * One search box, five kinds of identifier. Parses free text (or an explicit
 * mode) into a typed query and maps queries to and from URL parameters.
 */

import { normalizeVin, validateVin } from './vin';

export type QueryKind = 'vin' | 'plate' | 'dot' | 'mc' | 'name';
export type SearchMode = 'auto' | 'vin' | 'plate' | 'carrier';

export interface SearchQuery {
  readonly kind: QueryKind;
  readonly value: string;
  /** Issuing state for plates; null searches every state. */
  readonly state: string | null;
}

export type ParseResult =
  | { readonly ok: true; readonly query: SearchQuery }
  | { readonly ok: false; readonly error: string };

export const US_STATES: readonly string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE',
  'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
  'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];
const STATE_SET = new Set(US_STATES);

function vinError(vin: string): string | null {
  const verdict = validateVin(vin);
  return verdict.valid ? null : verdict.error;
}

function plateQuery(raw: string, explicitState: string | null): ParseResult {
  let text = raw.trim().toUpperCase();
  let state = explicitState && STATE_SET.has(explicitState) ? explicitState : null;
  // "80764A NV" or "NV 80764A": a trailing/leading state code.
  const parts = text.split(/\s+/);
  if (!state && parts.length === 2) {
    const [a = '', b = ''] = parts;
    if (STATE_SET.has(b) && !STATE_SET.has(a)) [text, state] = [a, b];
    else if (STATE_SET.has(a)) [text, state] = [b, a];
  }
  const plate = text.replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{2,10}$/.test(plate)) {
    return { ok: false, error: 'A plate is 2–10 letters or digits, optionally followed by the state (e.g. 80764A NV).' };
  }
  return { ok: true, query: { kind: 'plate', value: plate, state } };
}

function carrierQuery(raw: string): ParseResult {
  const text = raw.trim();
  const dot = text.match(/^(?:US\s*)?DOT\s*#?\s*(\d{1,8})$/i) ?? text.match(/^(\d{1,8})$/);
  if (dot?.[1]) return { ok: true, query: { kind: 'dot', value: dot[1], state: null } };
  const mc = text.match(/^(?:MC|MX|FF)[\s#-]*(\d{1,8})$/i);
  if (mc?.[1]) return { ok: true, query: { kind: 'mc', value: mc[1], state: null } };
  if (text.replace(/[^A-Za-z0-9]/g, '').length < 2) {
    return { ok: false, error: 'Enter a company or DBA name, a USDOT number, or an MC number.' };
  }
  return { ok: true, query: { kind: 'name', value: text.replace(/\s+/g, ' '), state: null } };
}

export function parseSearch(raw: string, mode: SearchMode, state: string | null = null): ParseResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Type a VIN, plate, company name, DBA, USDOT or MC number.' };

  if (mode === 'vin') {
    const vin = normalizeVin(text);
    const error = vinError(vin);
    return error ? { ok: false, error } : { ok: true, query: { kind: 'vin', value: vin, state: null } };
  }
  if (mode === 'plate') return plateQuery(text, state);
  if (mode === 'carrier') return carrierQuery(text);

  // Auto: explicit prefixes first, then shape.
  if (/^(?:US\s*)?DOT\b|^(?:MC|MX|FF)[\s#-]*\d/i.test(text)) return carrierQuery(text);
  const compact = normalizeVin(text);
  // Real VINs always carry several digits; "WERNER ENTERPRISES" is also 17 letters.
  if (/^[A-Z0-9]{17}$/.test(compact) && (compact.match(/\d/g)?.length ?? 0) >= 3) {
    const error = vinError(compact);
    return error ? { ok: false, error } : { ok: true, query: { kind: 'vin', value: compact, state: null } };
  }
  if (/^\d{1,8}$/.test(text)) return carrierQuery(text);
  const words = text.toUpperCase().split(/\s+/);
  const plateWord = (word: string): boolean => /^[A-Z0-9-]{2,10}$/.test(word) && /\d/.test(word);
  const plateShape =
    (words.length === 1 && plateWord(words[0] ?? '')) ||
    (words.length === 2 &&
      ((plateWord(words[0] ?? '') && STATE_SET.has(words[1] ?? '')) ||
        (STATE_SET.has(words[0] ?? '') && plateWord(words[1] ?? ''))));
  if (plateShape || (state && mode === 'auto' && /\d/.test(text))) return plateQuery(text, state);
  return carrierQuery(text);
}

/* ---------- URL mapping ---------- */

export function queryToParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set(query.kind, query.value);
  if (query.kind === 'plate' && query.state) params.set('state', query.state);
  return params;
}

export function queryFromParams(params: URLSearchParams): SearchQuery | null {
  for (const kind of ['vin', 'plate', 'dot', 'mc', 'name'] as const) {
    const value = params.get(kind)?.trim();
    if (!value) continue;
    if (kind === 'vin') return { kind, value: normalizeVin(value), state: null };
    if (kind === 'plate') {
      const state = params.get('state')?.trim().toUpperCase() ?? null;
      return { kind, value: value.toUpperCase(), state: state && STATE_SET.has(state) ? state : null };
    }
    return { kind, value, state: null };
  }
  return null;
}

export function queryHref(query: SearchQuery): string {
  return '?' + queryToParams(query).toString();
}

export function describeQuery(query: SearchQuery): string {
  switch (query.kind) {
    case 'vin':
      return 'VIN ' + query.value;
    case 'plate':
      return 'Plate ' + query.value + (query.state ? ' · ' + query.state : '');
    case 'dot':
      return 'USDOT ' + query.value;
    case 'mc':
      return 'MC ' + query.value;
    case 'name':
      return '“' + query.value + '”';
  }
}
