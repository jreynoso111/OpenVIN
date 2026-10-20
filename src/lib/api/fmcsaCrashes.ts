/**
 * Carrier crash counts from the FMCSA Crash file (U.S. DOT Open Data).
 * Only aggregate counts are read — never crash locations, drivers or the
 * carrier contact fields that sit in the same rows.
 */

import { asArray, asRecord, fetchJson } from './http';
import { numberField, socrataUrl, textField } from './fmcsaShared';

export const CRASH_DATASET = 'aayw-vxb3';

/** Look-back window for the crash summary. */
export const CRASH_MONTHS = 24;

export interface CrashSummary {
  dotNumber: string;
  crashes: number;
  fatalities: number;
  injuries: number;
  towAways: number;
  /** ISO date of the oldest day included in the window. */
  since: string;
  /** True when the row cap was hit and the real count is higher. */
  capped: boolean;
}

const ROW_CAP = 2000;
const cache = new Map<string, Promise<CrashSummary | null>>();

function windowStart(now: Date): Date {
  const start = new Date(now);
  start.setMonth(start.getMonth() - CRASH_MONTHS);
  return start;
}

function compactDate(date: Date): string {
  return (
    String(date.getFullYear()) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  );
}

function isoDay(date: Date): string {
  return compactDate(date).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
}

/** Fold raw crash rows into counts. Pure; exported for tests. */
export function summarizeCrashes(
  dotNumber: string,
  rows: readonly unknown[],
  since: string,
): CrashSummary {
  let fatalities = 0;
  let injuries = 0;
  let towAways = 0;
  for (const value of rows) {
    const row = asRecord(value);
    if (!row) continue;
    fatalities += numberField(row['fatalities']) ?? 0;
    injuries += numberField(row['injuries']) ?? 0;
    if (textField(row['tow_away'])?.toUpperCase() === 'Y') towAways += 1;
  }
  return {
    dotNumber,
    crashes: rows.length,
    fatalities,
    injuries,
    towAways,
    since,
    capped: rows.length >= ROW_CAP,
  };
}

/** Crash totals for the last two years; null when the lookup failed. Cached per session. */
export function getCrashSummary(dot: string, now: Date = new Date()): Promise<CrashSummary | null> {
  if (!/^\d+$/.test(dot)) return Promise.resolve(null);
  const key = String(Number(dot));
  const cached = cache.get(key);
  if (cached) return cached;
  const start = windowStart(now);
  const run = fetchJson(
    socrataUrl(CRASH_DATASET, {
      where: "dot_number='" + key + "' AND report_date>='" + compactDate(start) + "'",
      select: 'fatalities,injuries,tow_away',
      limit: ROW_CAP,
    }),
  ).then((response) => {
    const rows = response.ok ? asArray(response.data) : null;
    if (!rows) {
      cache.delete(key);
      return null;
    }
    return summarizeCrashes(key, rows, isoDay(start));
  });
  cache.set(key, run);
  return run;
}
