/**
 * Shared fetch helper for all client-side API modules.
 * Never throws: every failure mode is folded into a typed result with a
 * human-readable note, so callers can degrade to SectionStatus 'unavailable'.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; note: string };

interface FetchJsonOptions {
  timeoutMs?: number;
  /** Extra Accept header, e.g. 'application/json' for fueleconomy.gov */
  accept?: string;
}

/**
 * GET a URL and parse the body as JSON.
 * Timeouts (AbortController), HTTP errors, network/CORS failures, and
 * unparsable bodies all resolve to `{ ok: false, note }` — never a rejection.
 */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<FetchJsonResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, accept } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: accept ? { Accept: accept } : undefined,
    });
    if (!response.ok) {
      return {
        ok: false,
        note: `The source responded with HTTP ${response.status} — it may be temporarily down.`,
      };
    }
    try {
      const data: unknown = await response.json();
      return { ok: true, data };
    } catch {
      return { ok: false, note: 'The source returned an unreadable response.' };
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        note: `The source did not respond within ${Math.round(timeoutMs / 1000)}s.`,
      };
    }
    return {
      ok: false,
      note: 'The source could not be reached (network or browser security restriction).',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Narrow an unknown JSON value to a plain object, else null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Narrow an unknown JSON value to an array, else null. */
export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/** Read a string field; empty / "Not Applicable" / non-strings become null. */
export function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'Not Applicable') return null;
  return trimmed;
}

/** Parse an integer from a string or number field; anything else is null. */
export function intOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse a float from a string or number field; anything else is null. */
export function floatOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convert NHTSA "MM/DD/YYYY" dates to ISO "YYYY-MM-DD"; pass through otherwise. */
export function usDateToIso(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return value;
  return `${match[3]}-${match[1]}-${match[2]}`;
}
