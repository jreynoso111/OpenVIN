/**
 * Shared fetch helper for all client-side API modules.
 * Never throws: every failure mode is folded into a typed result with a
 * human-readable note, so callers can degrade to SectionStatus 'unavailable'.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * api.nhtsa.gov rate-limits bursts from a single IP with intermittent 503s
 * (observed in production: 3–4 simultaneous calls → some fail). Requests to
 * hosts listed here are serialized with a small gap; transient failures
 * (429/5xx, timeouts, network errors) are retried with backoff.
 */
const PACED_HOSTS: ReadonlySet<string> = new Set(['api.nhtsa.gov']);

/** Test seam: report tests stub fetch and zero these to stay fast. */
export const httpTuning: { retryDelaysMs: readonly number[]; pacingGapMs: number } = {
  retryDelaysMs: [900, 2200],
  pacingGapMs: 350,
};

export type FetchJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; note: string };

type AttemptResult =
  | { ok: true; data: unknown }
  | { ok: false; note: string; transient: boolean };

interface FetchJsonOptions {
  timeoutMs?: number;
  /** Extra Accept header, e.g. 'application/json' for fueleconomy.gov */
  accept?: string;
  /**
   * NHTSA vehicle endpoints return HTTP 400 for some unsupported vehicle
   * lines, even when the JSON body explicitly reports a successful empty
   * result. Accept only that documented no-match shape when opted in.
   */
  acceptNhtsaEmptyResults400?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const hostQueues = new Map<string, Promise<void>>();

/** Run one attempt; for burst-sensitive hosts, wait our turn plus a small gap. */
function paced(url: string, run: () => Promise<AttemptResult>): Promise<AttemptResult> {
  const host = hostOf(url);
  if (!PACED_HOSTS.has(host)) return run();
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const current = previous
    .then(() => delay(httpTuning.pacingGapMs))
    .then(run);
  hostQueues.set(
    host,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

async function attemptFetch(
  url: string,
  options: FetchJsonOptions,
): Promise<AttemptResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    accept,
    acceptNhtsaEmptyResults400 = false,
  } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: accept ? { Accept: accept } : undefined,
    });
    if (!response.ok) {
      if (response.status === 400 && acceptNhtsaEmptyResults400) {
        try {
          const data: unknown = await response.json();
          const root = asRecord(data);
          const results = root
            ? asArray(root['results']) ?? asArray(root['Results'])
            : null;
          const count = root
            ? intOrNull(root['count'] ?? root['Count'])
            : null;
          const message = root
            ? stringOrNull(root['message'] ?? root['Message'])
            : null;
          if (
            results?.length === 0 &&
            count === 0 &&
            message?.toLowerCase() === 'results returned successfully'
          ) {
            return { ok: true, data };
          }
        } catch {
          // Fall through to the normal HTTP error result for non-JSON bodies.
        }
      }
      return {
        ok: false,
        note: `The source responded with HTTP ${response.status} — it may be temporarily down.`,
        transient: response.status === 429 || response.status >= 500,
      };
    }
    try {
      const data: unknown = await response.json();
      return { ok: true, data };
    } catch {
      return {
        ok: false,
        note: 'The source returned an unreadable response.',
        transient: false,
      };
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        note: `The source did not respond within ${Math.round(timeoutMs / 1000)}s.`,
        transient: true,
      };
    }
    return {
      ok: false,
      note: 'The source could not be reached (network or browser security restriction).',
      transient: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET a URL and parse the body as JSON.
 * Timeouts (AbortController), HTTP errors, network/CORS failures, and
 * unparsable bodies all resolve to `{ ok: false, note }` — never a rejection.
 * Transient failures are retried with backoff; burst-sensitive hosts are
 * paced so parallel report sections don't trip per-IP rate limits.
 */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<FetchJsonResult> {
  let result = await paced(url, () => attemptFetch(url, options));
  for (const backoffMs of httpTuning.retryDelaysMs) {
    if (result.ok || !result.transient) break;
    await delay(backoffMs + Math.random() * 300);
    result = await paced(url, () => attemptFetch(url, options));
  }
  if (result.ok) return { ok: true, data: result.data };
  return { ok: false, note: result.note };
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
