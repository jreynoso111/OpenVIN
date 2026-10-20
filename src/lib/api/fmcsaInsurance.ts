/**
 * Insurance filings on record for a carrier, from the FMCSA "Active/Pending
 * Insurance" file (U.S. DOT Open Data). Business filings only: insurer name,
 * coverage type, limit and dates — no policyholder contacts.
 */

import { asArray, asRecord, fetchJson } from './http';
import { FMCSA_BASE, numberField, textField } from './fmcsaShared';

export const INSURANCE_DATASET = 'qh9u-swkp';

export interface InsurancePolicy {
  /** "BIPD/Primary", "CARGO", "SURETY"… as FMCSA labels it. */
  kind: string;
  insurer: string | null;
  /** Coverage limit in US dollars; null when not stated or zero. */
  limitUsd: number | null;
  effectiveDate: string | null;
  cancelDate: string | null;
}

export interface InsuranceSummary {
  dotNumber: string;
  policies: InsurancePolicy[];
}

const cache = new Map<string, Promise<InsuranceSummary | null>>();

/** "08/01/2025" → "2025-08-01". */
export function usDate(value: unknown): string | null {
  const raw = textField(value);
  const match = raw?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? match[3] + '-' + match[1] + '-' + match[2] : null;
}

/** Parse filings and keep those not already cancelled. Pure; exported for tests. */
export function parsePolicies(rows: readonly unknown[], today: string): InsurancePolicy[] {
  const policies: InsurancePolicy[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row) continue;
    const kind = textField(row['mod_col_1']);
    if (!kind) continue;
    const cancelDate = usDate(row['cancl_effective_date']);
    if (cancelDate && cancelDate <= today) continue;
    const thousands = numberField(row['max_cov_amount']);
    policies.push({
      kind,
      insurer: textField(row['name_company']),
      limitUsd: thousands && thousands > 0 ? thousands * 1000 : null,
      effectiveDate: usDate(row['effective_date']),
      cancelDate,
    });
  }
  // Newest filing first; one entry per kind keeps the card short.
  policies.sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''));
  const seen = new Set<string>();
  return policies.filter((policy) => {
    if (seen.has(policy.kind)) return false;
    seen.add(policy.kind);
    return true;
  });
}

/** Insurance filings for a USDOT number; null when the lookup failed. Cached per session. */
export function getInsurance(dot: string, now: Date = new Date()): Promise<InsuranceSummary | null> {
  if (!/^\d{1,8}$/.test(dot)) return Promise.resolve(null);
  const padded = dot.padStart(8, '0');
  const cached = cache.get(padded);
  if (cached) return cached;
  const url = new URL(FMCSA_BASE + '/' + INSURANCE_DATASET + '.json');
  url.searchParams.set('$where', "dot_number='" + padded + "'");
  url.searchParams.set(
    '$select',
    'mod_col_1,name_company,max_cov_amount,effective_date,cancl_effective_date',
  );
  url.searchParams.set('$limit', '60');
  const today = now.toISOString().slice(0, 10);
  const run = fetchJson(url.toString()).then((response) => {
    const rows = response.ok ? asArray(response.data) : null;
    if (!rows) {
      cache.delete(padded);
      return null;
    }
    return { dotNumber: String(Number(dot)), policies: parsePolicies(rows, today) };
  });
  cache.set(padded, run);
  return run;
}
