/**
 * Carrier-level crash history from the FMCSA Crash file (U.S. DOT Open Data).
 * Read only incident date/state/severity fields; never locations, VINs, names,
 * driver fields or carrier contact fields from the source rows.
 */

import type { SectionResult } from '../types';
import { asArray, asRecord, fetchJson } from './http';
import { isoDate, numberField, socrataUrl, soqlString, textField } from './fmcsaShared';

export const CRASH_DATASET = 'aayw-vxb3';

/** Look-back window for the crash summary. */
export const CRASH_MONTHS = 24;

const PLATE_CRASH_SOURCE = {
  name: 'FMCSA Crash File (U.S. DOT Open Data)',
  url: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
} as const;

export interface CrashSummary {
  dotNumber: string;
  /** Distinct public incident records after merging multiple CMV rows per incident. */
  crashes: number;
  fatalities: number;
  injuries: number;
  towAways: number;
  /** ISO date of the oldest day included in the window. */
  since: string;
  /** True when the row cap was hit and the real count is higher. */
  capped: boolean;
}

/** Public carrier-level crash record with personal and precise-location fields omitted. */
export interface CrashEvent {
  id: string;
  date: string | null;
  state: string | null;
  fatalities: number;
  injuries: number;
  towAway: boolean;
}

export interface CrashHistory extends CrashSummary {
  events: CrashEvent[];
}

export interface PlateCrashEvent {
  id: string;
  date: string | null;
  reportState: string | null;
  plate: string;
  plateState: string | null;
  vin: string | null;
  fatalities: number | null;
  injuries: number | null;
  towAway: boolean | null;
}

export interface PlateCrashHistory {
  events: PlateCrashEvent[];
  since: string;
  capped: boolean;
}

const ROW_CAP = 2000;
const cache = new Map<string, Promise<CrashHistory | null>>();
const plateCache = new Map<string, Promise<SectionResult<PlateCrashHistory>>>();

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

/** Fold source rows into raw-row counts. Pure; exported for the aggregate-only contract. */
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

/** Project only public fields useful for a carrier timeline; omit names, VINs and locations. */
export function crashEvents(rows: readonly unknown[]): CrashEvent[] {
  const events = new Map<string, CrashEvent>();
  rows.forEach((value, index) => {
    const row = asRecord(value);
    if (!row) return;
    const state = textField(row['report_state'])?.toUpperCase() ?? null;
    const reportNumber = textField(row['report_number']);
    const date = isoDate(row['report_date']);
    const time = textField(row['report_time']);
    const sequence = textField(row['report_seq_no']);
    const crashId = textField(row['crash_id']);
    const incidentParts = [state, reportNumber, date, time];
    const id = incidentParts.every(Boolean)
      ? incidentParts.join('|')
      : [state, reportNumber, date, time, sequence].filter(Boolean).join('|') || crashId || `row-${index}`;
    const existing = events.get(id);
    const fatalities = numberField(row['fatalities']) ?? 0;
    const injuries = numberField(row['injuries']) ?? 0;
    const towAway = textField(row['tow_away'])?.toUpperCase() === 'Y';
    events.set(id, {
      id,
      date: existing?.date ?? date,
      state: existing?.state ?? state,
      fatalities: Math.max(existing?.fatalities ?? 0, fatalities),
      injuries: Math.max(existing?.injuries ?? 0, injuries),
      towAway: Boolean(existing?.towAway || towAway),
    });
  });
  return [...events.values()].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? '') || (a.state ?? '').localeCompare(b.state ?? ''),
  );
}

/** Crash records for the last two years; null when the lookup failed. Cached per session. */
export function getCrashHistory(dot: string, now: Date = new Date()): Promise<CrashHistory | null> {
  if (!/^\d+$/.test(dot)) return Promise.resolve(null);
  const key = String(Number(dot));
  const cached = cache.get(key);
  if (cached) return cached;
  const start = windowStart(now);
  const run = fetchJson(
    socrataUrl(CRASH_DATASET, {
      where: "dot_number='" + key + "' AND report_date>='" + compactDate(start) + "'",
      select: 'crash_id,report_state,report_number,report_date,report_time,report_seq_no,fatalities,injuries,tow_away',
      limit: ROW_CAP,
      order: 'report_date DESC',
    }),
  ).then((response) => {
    const rows = response.ok ? asArray(response.data) : null;
    if (!rows) {
      cache.delete(key);
      return null;
    }
    const events = crashEvents(rows);
    return {
      ...summarizeCrashes(key, rows, isoDay(start)),
      crashes: events.length,
      fatalities: events.reduce((sum, event) => sum + event.fatalities, 0),
      injuries: events.reduce((sum, event) => sum + event.injuries, 0),
      towAways: events.filter((event) => event.towAway).length,
      events,
    };
  });
  cache.set(key, run);
  return run;
}

/** Backwards-compatible aggregate-only view. */
export function getCrashSummary(dot: string, now: Date = new Date()): Promise<CrashSummary | null> {
  return getCrashHistory(dot, now).then((history) => {
    if (!history) return null;
    const { events: _events, ...summary } = history;
    return summary;
  });
}

function normalizeLicense(value: string | null): string {
  return (value ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** Recent reported FMCSA crash rows matching the exact plate and, when supplied, issuing state. */
export function getPlateCrashHistory(
  rawPlate: string,
  rawState: string | null,
  now: Date = new Date(),
): Promise<SectionResult<PlateCrashHistory>> {
  const plate = normalizeLicense(rawPlate);
  const state = rawState?.trim().toUpperCase() || null;
  const fetchedAt = new Date().toISOString();
  const source = { ...PLATE_CRASH_SOURCE, fetchedAt };
  if (!/^[A-Z0-9]{2,10}$/.test(plate) || (state && !/^[A-Z]{2}$/.test(state))) {
    return Promise.resolve({ status: 'unavailable', source, note: 'Enter a valid plate and two-letter state.' });
  }
  const start = windowStart(now);
  const since = isoDay(start);
  const key = [plate, state ?? '*', since].join('|');
  const cached = plateCache.get(key);
  if (cached) return cached;

  const clauses = [
    'upper(vehicle_license_number) in (' +
      [...new Set([plate, rawPlate.trim().toUpperCase().replace(/\s+/g, ' ')])]
        .filter((form) => /^[A-Z0-9 -]{2,12}$/.test(form))
        .map(soqlString)
        .join(',') +
      ')',
    "report_date>='" + compactDate(start) + "'",
  ];
  if (state) clauses.push('upper(vehicle_lic_state)=' + soqlString(state));
  const run = fetchJson(
    socrataUrl(CRASH_DATASET, {
      where: clauses.join(' AND '),
      select: 'crash_id,report_state,report_number,report_date,report_time,report_seq_no,vehicle_identification_number,vehicle_license_number,vehicle_lic_state,fatalities,injuries,tow_away',
      limit: ROW_CAP,
      order: 'report_date DESC',
    }),
  ).then((response): SectionResult<PlateCrashHistory> => {
    const rows = response.ok ? asArray(response.data) : null;
    if (!rows) {
      plateCache.delete(key);
      return {
        status: 'unavailable',
        source,
        note: response.ok ? 'FMCSA returned an unexpected crash-file response.' : response.note,
      };
    }
    const events = new Map<string, PlateCrashEvent>();
    for (const [index, value] of rows.entries()) {
      const row = asRecord(value);
      if (!row) continue;
      const rowPlate = normalizeLicense(textField(row['vehicle_license_number']));
      const rowState = textField(row['vehicle_lic_state'])?.trim().toUpperCase() ?? null;
      if (rowPlate !== plate || (state && rowState !== state)) continue;
      const reportState = textField(row['report_state'])?.trim().toUpperCase() ?? null;
      const date = isoDate(row['report_date']);
      const reportNumber = textField(row['report_number']);
      const time = textField(row['report_time']);
      const sequence = textField(row['report_seq_no']);
      const crashId = textField(row['crash_id']);
      const identity = [reportState, reportNumber, date, time].every(Boolean)
        ? [reportState, reportNumber, date, time].join('|')
        : [reportState, reportNumber, date, time, sequence].filter(Boolean).join('|') || crashId || `row-${index}`;
      const vin = textField(row['vehicle_identification_number'])?.trim().toUpperCase() ?? null;
      const id = identity + '|' + (vin ?? 'no-vin');
      const fatalities = numberField(row['fatalities']);
      const injuries = numberField(row['injuries']);
      const towAwayValue = textField(row['tow_away'])?.trim().toUpperCase();
      const towAway = towAwayValue === 'Y' ? true : towAwayValue === 'N' ? false : null;
      const existing = events.get(id);
      if (existing) {
        events.set(id, {
          ...existing,
          fatalities: existing.fatalities ?? fatalities,
          injuries: existing.injuries ?? injuries,
          towAway: existing.towAway === true || towAway === true ? true : existing.towAway ?? towAway,
        });
        continue;
      }
      events.set(id, {
        id,
        date,
        reportState,
        plate,
        plateState: rowState,
        vin,
        fatalities,
        injuries,
        towAway,
      });
    }
    const ordered = [...events.values()].sort((a, b) =>
      (b.date ?? '').localeCompare(a.date ?? '') || (a.reportState ?? '').localeCompare(b.reportState ?? ''),
    );
    return {
      status: ordered.length > 0 ? 'hit' : 'miss',
      data: { events: ordered, since, capped: rows.length >= ROW_CAP },
      source,
      note: ordered.length > 0 ? undefined : 'No matching plate record in the FMCSA crash file for this period.',
    };
  }).catch((error: unknown): SectionResult<PlateCrashHistory> => {
    plateCache.delete(key);
    return {
      status: 'unavailable',
      source,
      note: error instanceof Error ? error.message : 'FMCSA crash-file lookup failed.',
    };
  });
  plateCache.set(key, run);
  return run;
}
