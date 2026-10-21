/**
 * Insurance filings on record for a carrier, from the FMCSA "Active/Pending
 * Insurance" file (U.S. DOT Open Data). Business filings only: insurer name,
 * coverage type, limit and dates — no policyholder contacts.
 */

import { asArray, asRecord, fetchJson } from './http';
import { FMCSA_BASE, isoDate, numberField, textField } from './fmcsaShared';

export const INSURANCE_DATASET = 'qh9u-swkp';
export const MOTUS_INSURANCE_DATASET = 'c5y8-a4uz';
export const MOTUS_INSURANCE_HISTORY_DATASET = '3uet-3z4i';

export interface InsurancePolicy {
  /** "BIPD/Primary", "CARGO", "SURETY"… as FMCSA labels it. */
  kind: string;
  insurer: string | null;
  /** Coverage limit in US dollars; null when not stated or zero. */
  limitUsd: number | null;
  effectiveDate: string | null;
  cancelDate: string | null;
  filedDate?: string | null;
  filingStatusReason?: string | null;
}

export interface HistoricalInsurancePolicy extends InsurancePolicy {
  filingStatusReason: string | null;
}

export interface InsuranceSummary {
  dotNumber: string;
  policies: InsurancePolicy[];
  history: HistoricalInsurancePolicy[];
  /** Legacy L&I data stopped refreshing after the Motus migration. */
  currentSource: 'Motus' | 'Legacy L&I' | 'No filing returned' | 'Unavailable';
  historySource: 'Motus' | null;
}

const cache = new Map<string, Promise<InsuranceSummary | null>>();

function dateField(value: unknown): string | null {
  return usDate(value) ?? isoDate(value);
}

function rowsUrl(dataset: string, dotField: string, dot: string, select: string, limit: number, padded = false): string {
  const url = new URL(FMCSA_BASE + '/' + dataset + '.json');
  url.searchParams.set('$where', dotField + "='" + (padded ? dot.padStart(8, '0') : dot) + "'");
  url.searchParams.set('$select', select);
  url.searchParams.set('$limit', String(limit));
  return url.toString();
}

async function rowsOf(url: string): Promise<unknown[] | null> {
  const response = await fetchJson(url);
  return response.ok ? asArray(response.data) : null;
}

function typeLabel(formCode: string | null, typeCode: string | null, description: string | null): string {
  if (description) return description;
  const forms: Readonly<Record<string, string>> = {
    '34': 'Cargo insurance',
    '82': 'BIPD liability',
    '83': 'Cargo insurance',
    '84': 'Broker surety bond',
    '85': 'Broker trust fund',
    '91': 'BIPD liability',
    '91X': 'BIPD liability',
  };
  const types: Readonly<Record<string, string>> = {
    '1': 'BIPD liability',
    '2': 'Cargo insurance',
    '3': 'Surety bond',
    '4': 'Trust fund',
  };
  return (formCode ? forms[formCode.toUpperCase()] : null) ??
    (typeCode ? types[typeCode] : null) ?? 'Insurance filing';
}

function parseMotusCurrent(rows: readonly unknown[], today: string): InsurancePolicy[] {
  return rows.flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];
    const effectiveDate = dateField(row['effective_date']);
    const maxCoverage = numberField(row['max_cov_amount']);
    return [{
      kind: typeLabel(textField(row['ins_form_code']), textField(row['ins_type_code']), null),
      insurer: textField(row['insurance_company_name']),
      limitUsd: maxCoverage && maxCoverage > 0 ? maxCoverage * 1000 : null,
      effectiveDate,
      cancelDate: null,
      filedDate: dateField(row['trans_date']),
      filingStatusReason: effectiveDate && effectiveDate > today ? 'Pending effective date' : null,
    }];
  }).sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''));
}

function parseMotusHistory(rows: readonly unknown[]): HistoricalInsurancePolicy[] {
  return rows.flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];
    const maxCoverage = numberField(row['max_cov_amount']);
    return [{
      kind: typeLabel(textField(row['ins_form_code']), textField(row['ins_type_code']), textField(row['ins_type_desc'])),
      insurer: textField(row['insurance_company_name']),
      limitUsd: maxCoverage && maxCoverage > 0 ? maxCoverage * 1000 : null,
      effectiveDate: dateField(row['effective_date']),
      cancelDate: dateField(row['cancl_effective_date']),
      filingStatusReason: textField(row['filing_status_reason']),
    }];
  }).sort((a, b) => (b.cancelDate ?? b.effectiveDate ?? '').localeCompare(a.cancelDate ?? a.effectiveDate ?? ''));
}

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
      filedDate: null,
      filingStatusReason: null,
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
  const today = now.toISOString().slice(0, 10);
  const run = Promise.all([
    rowsOf(rowsUrl(
      MOTUS_INSURANCE_DATASET,
      'usdot_number',
      String(Number(dot)),
      'docket_number,usdot_number,ins_form_code,ins_type_code,max_cov_amount,underl_lim_amount,effective_date,insurance_company_name,trans_date',
      60,
    )),
    rowsOf(rowsUrl(
      MOTUS_INSURANCE_HISTORY_DATASET,
      'usdot_number',
      String(Number(dot)),
      'docket_number,usdot_number,ins_form_code,ins_type_code,ins_type_desc,filing_status_reason,min_cov_amount,ins_class_code,effective_date,underl_lim_amount,max_cov_amount,cancl_effective_date,insurance_company_name',
      100,
    )),
    rowsOf(rowsUrl(
      INSURANCE_DATASET,
      'dot_number',
      dot,
      'mod_col_1,name_company,max_cov_amount,effective_date,cancl_effective_date',
      60,
      true,
    )),
  ]).then(([motusCurrent, motusHistory, legacyCurrent]) => {
    if (motusCurrent === null && motusHistory === null && legacyCurrent === null) {
      cache.delete(padded);
      return null;
    }
    const modernPolicies = motusCurrent ? parseMotusCurrent(motusCurrent, today) : [];
    const legacyPolicies = legacyCurrent ? parsePolicies(legacyCurrent, today) : [];
    const useMotus = modernPolicies.length > 0;
    const history = motusHistory ? parseMotusHistory(motusHistory) : [];
    const currentSource: InsuranceSummary['currentSource'] = useMotus
      ? 'Motus'
      : legacyPolicies.length > 0
        ? 'Legacy L&I'
        : motusCurrent !== null
          ? 'No filing returned'
          : 'Unavailable';
    const historySource: InsuranceSummary['historySource'] = motusHistory !== null ? 'Motus' : null;
    return {
      dotNumber: String(Number(dot)),
      policies: useMotus ? modernPolicies : legacyPolicies,
      history,
      currentSource,
      historySource,
    };
  });
  cache.set(padded, run);
  return run;
}
