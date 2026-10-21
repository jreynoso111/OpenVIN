/**
 * Current operating-authority records and public status history for one carrier.
 * The Motus files are queried by USDOT; the legacy history is used only as a
 * historical supplement for older dockets. No contact or policy-number fields
 * are requested.
 */

import type { CarrierProfile } from '../types';
import { asArray, asRecord, fetchJson } from './http';
import { FMCSA_BASE, isoDate, numberField, textField } from './fmcsaShared';
import { usDate } from './fmcsaInsurance';

export const MOTUS_AUTHORITY_DATASET = 'inys-ebih';
export const MOTUS_AUTHORITY_HISTORY_DATASET = 'yu5v-wbh6';
export const LEGACY_AUTHORITY_HISTORY_DATASET = '9mw4-x3tu';

export const AUTHORITY_SOURCE = {
  name: 'FMCSA Motus operating authority records',
  url: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
} as const;

export interface CurrentAuthority {
  docketNumber: string | null;
  type: string | null;
  status: string | null;
  minimumBipdUsd: number | null;
  bipdOnFileUsd: number | null;
  cargoRequired: boolean | null;
  cargoOnFile: boolean | null;
  bondRequired: boolean | null;
  bondOnFile: boolean | null;
}

export interface AuthorityEvent {
  docketNumber: string | null;
  date: string | null;
  action: string | null;
  reason: string | null;
  disposition: string | null;
  dispositionDate: string | null;
  source: 'Motus' | 'Legacy archive';
}

export interface CarrierAuthoritySnapshot {
  current: CurrentAuthority[];
  history: AuthorityEvent[];
  currentFileResponded: boolean;
  historyFileResponded: boolean;
}

function boolField(value: unknown): boolean | null {
  const raw = textField(value)?.toUpperCase();
  if (raw === 'Y') return true;
  if (raw === 'N') return false;
  return null;
}

function thousands(value: unknown): number | null {
  const amount = numberField(value);
  return amount === null ? null : amount * 1000;
}

function currentRows(rows: readonly unknown[]): CurrentAuthority[] {
  return rows.flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];
    return [{
      docketNumber: textField(row['docket_number']),
      type: textField(row['op_auth_type']),
      status: textField(row['op_auth_status']),
      minimumBipdUsd: thousands(row['min_cov_amount']),
      bipdOnFileUsd: thousands(row['bipd_file']),
      cargoRequired: boolField(row['cargo_req']),
      cargoOnFile: boolField(row['cargo_file']),
      bondRequired: boolField(row['bond_req']),
      bondOnFile: boolField(row['bond_file']),
    }];
  });
}

function motusHistory(rows: readonly unknown[]): AuthorityEvent[] {
  return rows.flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];
    const date = textField(row['status_change_date']);
    return [{
      docketNumber: textField(row['docket_number']),
      date: isoDate(date),
      action: textField(row['op_auth_status']),
      reason: textField(row['reason']),
      disposition: null,
      dispositionDate: null,
      source: 'Motus' as const,
    }];
  });
}

function legacyHistory(rows: readonly unknown[]): AuthorityEvent[] {
  return rows.flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];
    const dispositionDate = usDate(row['disp_decided_date']) ?? usDate(row['disp_served_date']);
    return [{
      docketNumber: textField(row['docket_number']),
      date: usDate(row['orig_served_date']),
      action: textField(row['original_action_desc']),
      reason: null,
      disposition: textField(row['disp_action_desc']),
      dispositionDate,
      source: 'Legacy archive' as const,
    }];
  });
}

function queryUrl(dataset: string, where: string, select: string, limit: number, order?: string): string {
  const url = new URL(FMCSA_BASE + '/' + dataset + '.json');
  url.searchParams.set('$where', where);
  url.searchParams.set('$select', select);
  url.searchParams.set('$limit', String(limit));
  if (order) url.searchParams.set('$order', order);
  return url.toString();
}

async function rowsOf(url: string): Promise<unknown[] | null> {
  const response = await fetchJson(url);
  return response.ok ? asArray(response.data) : null;
}

const cache = new Map<string, Promise<CarrierAuthoritySnapshot | null>>();

/** Look up current Motus authority and history for one USDOT carrier. */
export function getCarrierAuthority(carrier: CarrierProfile): Promise<CarrierAuthoritySnapshot | null> {
  if (!/^\d{1,8}$/.test(carrier.dotNumber)) return Promise.resolve(null);
  const dot = String(Number(carrier.dotNumber));
  const docket = carrier.docketPrefix && carrier.docketNumber
    ? carrier.docketPrefix + carrier.docketNumber.padStart(6, '0')
    : null;
  const key = dot + '|' + (docket ?? '');
  const cached = cache.get(key);
  if (cached) return cached;

  const currentUrl = queryUrl(
    MOTUS_AUTHORITY_DATASET,
    "usdot_number='" + dot + "'",
    'docket_number,usdot_number,op_auth_type,op_auth_status,min_cov_amount,cargo_req,bond_req,bipd_file,cargo_file,bond_file',
    30,
    'docket_number',
  );
  const motusHistoryUrl = queryUrl(
    MOTUS_AUTHORITY_HISTORY_DATASET,
    "usdot_number='" + dot + "'",
    'docket_number,usdot_number,op_auth_type,op_auth_status,reason,status_change_date',
    100,
    'status_change_date DESC',
  );
  const legacyUrl = docket
    ? queryUrl(
        LEGACY_AUTHORITY_HISTORY_DATASET,
        "docket_number='" + docket + "'",
        'docket_number,dot_number,original_action_desc,orig_served_date,disp_action_desc,disp_decided_date,disp_served_date',
        100,
        'orig_served_date DESC',
      )
    : null;

  const run = Promise.all([
    rowsOf(currentUrl),
    rowsOf(motusHistoryUrl),
    legacyUrl ? rowsOf(legacyUrl) : Promise.resolve([] as unknown[]),
  ]).then(([current, motus, legacy]) => {
    if (current === null && motus === null && legacy === null) {
      cache.delete(key);
      return null;
    }
    const legacyResponded = legacyUrl !== null && legacy !== null;
    const history = [...motusHistory(motus ?? []), ...legacyHistory(legacy ?? [])];
    const seen = new Set<string>();
    const uniqueHistory = history
      .filter((event) => {
        const signature = [event.docketNumber, event.date, event.action, event.reason, event.disposition].join('|');
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return {
      current: currentRows(current ?? []),
      history: uniqueHistory,
      currentFileResponded: current !== null,
      historyFileResponded: motus !== null || legacyResponded,
    };
  });
  cache.set(key, run);
  return run;
}
