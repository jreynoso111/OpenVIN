/**
 * Regulatory standing of a carrier, from four FMCSA open datasets: Out of
 * Service orders, authority revocations, authority history and the SMS
 * inspection measures. Business-level compliance facts only; the SMS census
 * file, which also carries contact fields, is never read.
 */

import { asArray, asRecord, fetchJson } from './http';
import { FMCSA_BASE, numberField, textField } from './fmcsaShared';
import { usDate } from './fmcsaInsurance';

export const OOS_ORDER_DATASET = 'p2mt-9ige';
export const REVOCATION_DATASET = 'sa6p-acbp';
export const AUTHORITY_HISTORY_DATASET = '9mw4-x3tu';
export const SMS_DATASET = '4y6x-dmck';

/** FMCSA's published national average vehicle out-of-service rate is roughly this. */
export const NATIONAL_VEHICLE_OOS_RATE = 0.22;

export interface OosOrder {
  active: boolean;
  date: string | null;
  rescindDate: string | null;
  reason: string | null;
}

export interface Revocation {
  kind: string;
  effectiveDate: string | null;
  reinstatedDate?: string | null;
}

export interface SmsMeasures {
  inspections: number;
  vehicleInspections: number;
  vehicleOosInspections: number;
  /** Vehicle OOS inspections ÷ vehicle inspections; null with no inspections. */
  vehicleOosRate: number | null;
  driverInspections: number;
  driverOosInspections: number;
  driverOosRate: number | null;
  /** BASIC categories where FMCSA's alert threshold is exceeded. */
  alerts: string[];
}

export interface CarrierStanding {
  dotNumber: string;
  oosOrders: OosOrder[];
  revocations: Revocation[];
  /** Earliest date operating authority was granted; null when not on file. */
  authoritySince: string | null;
  sms: SmsMeasures | null;
}

const BASIC_ALERTS: ReadonlyArray<readonly [string, string]> = [
  ['unsafe_driv_ac', 'Unsafe driving'],
  ['hos_driv_ac', 'Hours of service'],
  ['driv_fit_ac', 'Driver fitness'],
  ['contr_subst_ac', 'Controlled substances'],
  ['veh_maint_ac', 'Vehicle maintenance'],
];

export function parseOosOrders(
  rows: readonly unknown[],
  today: string = new Date().toISOString().slice(0, 10),
): OosOrder[] {
  const orders: OosOrder[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row) continue;
    const rescindDate = textField(row['rescind_date'])?.slice(0, 10) ?? null;
    orders.push({
      // The feed can retain an ACTIVE status after the order was rescinded.
      active: textField(row['status'])?.toUpperCase() === 'ACTIVE' && (!rescindDate || rescindDate > today),
      date: textField(row['oos_date'])?.slice(0, 10) ?? null,
      rescindDate,
      reason: textField(row['oos_reason']),
    });
  }
  return orders.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

export function parseRevocations(rows: readonly unknown[]): Revocation[] {
  const list: Revocation[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row) continue;
    const kind = textField(row['order2_type_desc']);
    if (!kind) continue;
    list.push({ kind, effectiveDate: usDate(row['order2_effective_date']), reinstatedDate: null });
  }
  return list.sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''));
}

function parseReinstatementDates(rows: readonly unknown[]): string[] {
  const dates: string[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row || textField(row['original_action_desc'])?.toUpperCase() !== 'REINSTATED') continue;
    const date = usDate(row['orig_served_date']);
    if (date) dates.push(date);
  }
  return dates.sort();
}

function addReinstatementDates(revocations: Revocation[], rows: readonly unknown[]): Revocation[] {
  const reinstatements = parseReinstatementDates(rows);
  return revocations.map((revocation) => {
    const date = revocation.effectiveDate;
    if (!date) return revocation;
    const nextRevocation = revocations
      .map((item) => item.effectiveDate)
      .filter((item): item is string => item !== null && item > date)
      .sort()[0];
    const reinstatedDate = reinstatements.find(
      (item) => item > date && (!nextRevocation || item < nextRevocation),
    ) ?? null;
    return { ...revocation, reinstatedDate };
  });
}

export function parseAuthoritySince(rows: readonly unknown[]): string | null {
  const dates: string[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row || textField(row['original_action_desc'])?.toUpperCase() !== 'GRANTED') continue;
    const date = usDate(row['orig_served_date']);
    if (date) dates.push(date);
  }
  return dates.sort()[0] ?? null;
}

export function parseSms(rows: readonly unknown[]): SmsMeasures | null {
  const row = asRecord(rows[0]);
  if (!row) return null;
  const count = (key: string): number => numberField(row[key]) ?? 0;
  const vehicleInspections = count('vehicle_insp_total');
  const driverInspections = count('driver_insp_total');
  return {
    inspections: count('insp_total'),
    vehicleInspections,
    vehicleOosInspections: count('vehicle_oos_insp_total'),
    vehicleOosRate: vehicleInspections > 0 ? count('vehicle_oos_insp_total') / vehicleInspections : null,
    driverInspections,
    driverOosInspections: count('driver_oos_insp_total'),
    driverOosRate: driverInspections > 0 ? count('driver_oos_insp_total') / driverInspections : null,
    alerts: BASIC_ALERTS.filter(([key]) => textField(row[key])?.toUpperCase() === 'Y').map(([, label]) => label),
  };
}

function datasetUrl(dataset: string, where: string, limit: number, select?: string): string {
  const url = new URL(FMCSA_BASE + '/' + dataset + '.json');
  url.searchParams.set('$where', where);
  if (select) url.searchParams.set('$select', select);
  url.searchParams.set('$limit', String(limit));
  return url.toString();
}

async function rowsOf(url: string): Promise<unknown[] | null> {
  const response = await fetchJson(url);
  return response.ok ? asArray(response.data) : null;
}

const cache = new Map<string, Promise<CarrierStanding | null>>();

/**
 * Standing for one USDOT number. Each dataset can fail on its own: the result
 * keeps what answered, and is null only when every dataset failed.
 */
export function getCarrierStanding(
  dot: string,
  docket: string | null,
): Promise<CarrierStanding | null> {
  if (!/^\d{1,8}$/.test(dot)) return Promise.resolve(null);
  const plain = String(Number(dot));
  const padded = plain.padStart(8, '0');
  const key = plain + '|' + (docket ?? '');
  const cached = cache.get(key);
  if (cached) return cached;

  const run = Promise.all([
    rowsOf(datasetUrl(OOS_ORDER_DATASET, "dot_number='" + plain + "'", 20, 'status,oos_date,rescind_date,oos_reason')),
    rowsOf(datasetUrl(REVOCATION_DATASET, "dot_number='" + padded + "'", 20, 'order2_type_desc,order2_effective_date')),
    docket && /^[A-Z]{2}\d+$/.test(docket)
      ? rowsOf(datasetUrl(AUTHORITY_HISTORY_DATASET, "docket_number='" + docket + "'", 200, 'original_action_desc,orig_served_date'))
      : Promise.resolve([] as unknown[]),
    rowsOf(datasetUrl(SMS_DATASET, "dot_number='" + plain + "'", 1)),
  ]).then(([oos, revocations, authority, sms]) => {
    if (!oos && !revocations && !authority && !sms) {
      cache.delete(key);
      return null;
    }
    return {
      dotNumber: plain,
      oosOrders: parseOosOrders(oos ?? []),
      revocations: addReinstatementDates(parseRevocations(revocations ?? []), authority ?? []),
      authoritySince: parseAuthoritySince(authority ?? []),
      sms: sms ? parseSms(sms) : null,
    };
  });
  cache.set(key, run);
  return run;
}
