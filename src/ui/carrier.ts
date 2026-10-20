/** Carrier (USDOT) profile block, shared by VIN, plate and carrier files. */

import { CRASH_MONTHS, getCrashSummary } from '../lib/api/fmcsaCrashes';
import { getInsurance } from '../lib/api/fmcsaInsurance';
import { NATIONAL_VEHICLE_OOS_RATE, getCarrierStanding } from '../lib/api/fmcsaStanding';
import type { CarrierProfile } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { factList } from './panel';
import { dotPivot, externalLink, pivot, saferSnapshotUrl } from './pivot';

const STATUS: Readonly<Record<string, string>> = { A: 'Active', I: 'Inactive', N: 'Not authorized' };
const RATING: Readonly<Record<string, string>> = {
  S: 'Satisfactory',
  C: 'Conditional',
  U: 'Unsatisfactory',
};

export function statusText(code: string | null): string | null {
  if (!code) return null;
  return STATUS[code] ?? code;
}

/** "PRIVATE PROPERTY;AUTHORIZED FOR HIRE" → "Private property, authorized for hire". */
export function operationText(carrier: CarrierProfile): string | null {
  if (!carrier.operationClass) return null;
  const text = carrier.operationClass.toLowerCase().split(';').map((part) => part.trim()).filter(Boolean).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function carrierName(carrier: CarrierProfile): string {
  return carrier.legalName ?? carrier.dbaName ?? 'Individual operator · name withheld';
}

export function carrierBase(carrier: CarrierProfile): string | null {
  const parts = [carrier.baseCity, carrier.baseState].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function docketLabel(carrier: CarrierProfile): string | null {
  if (!carrier.docketNumber) return null;
  return (carrier.docketPrefix ?? 'MC') + ' ' + carrier.docketNumber;
}

/** Compact carrier header line: name, DBA, USDOT, status. */
export function carrierLine(carrier: CarrierProfile, options: { link?: boolean } = {}): HTMLElement {
  const status = statusText(carrier.status);
  return el(
    'div',
    { class: 'carrier-line' },
    options.link === false
      ? el('strong', { class: 'carrier-line__name' }, carrierName(carrier))
      : el(
          'a',
          { class: 'carrier-line__name', href: '?dot=' + carrier.dotNumber, 'data-pivot': '' },
          carrierName(carrier),
        ),
    carrier.dbaName && carrier.legalName
      ? el('span', { class: 'carrier-line__dba' }, 'DBA ' + carrier.dbaName)
      : null,
    el(
      'span',
      { class: 'carrier-line__ids' },
      'USDOT ' + carrier.dotNumber,
      docketLabel(carrier) ? ' · ' + docketLabel(carrier) : null,
      status ? el('span', { class: 'tag', 'data-tone': carrier.status === 'A' ? 'ok' : 'muted' }, status) : null,
    ),
  );
}

/** Full census facts for a carrier. */
export function carrierFacts(carrier: CarrierProfile): HTMLElement | null {
  const crashRate =
    carrier.recordableCrashRate === null
      ? null
      : carrier.recordableCrashRate.toLocaleString('en-US', { maximumFractionDigits: 3 });
  const docket = docketLabel(carrier);
  return factList([
    ['Base of operations', carrierBase(carrier)],
    ['Operation', operationText(carrier)],
    [
      'Fleet (reported)',
      carrier.powerUnits === null && carrier.truckUnits === null
        ? null
        : [
            carrier.powerUnits !== null ? formatNumber(carrier.powerUnits) + ' power units' : null,
            carrier.drivers !== null ? formatNumber(carrier.drivers) + ' drivers' : null,
          ]
            .filter(Boolean)
            .join(' · '),
    ],
    [
      'Authority',
      docket
        ? el(
            'span',
            {},
            pivot(
              { kind: 'mc', value: carrier.docketNumber ?? '', state: null },
              { label: docket },
            ),
            statusText(carrier.authorityStatus) ? ' · ' + statusText(carrier.authorityStatus) : null,
          )
        : null,
    ],
    [
      'Safety rating',
      carrier.safetyRating
        ? (RATING[carrier.safetyRating] ?? carrier.safetyRating) +
          (carrier.safetyRatingDate ? ' · ' + formatDate(carrier.safetyRatingDate) : '')
        : null,
    ],
    ['Crash-rate field', crashRate],
    ['MCS-150 filed', carrier.mcs150Date ? formatDate(carrier.mcs150Date) : null],
    ['Registered', carrier.addedDate ? formatDate(carrier.addedDate) : null],
  ]);
}

/** Two-year crash totals for a carrier, filled in when the Crash file answers. */
export function crashLine(dotNumber: string): HTMLElement {
  const line = el('p', { class: 'crashes crashes--pending' }, 'Checking crash history…');
  void getCrashSummary(dotNumber)
    .then((summary) => {
      line.classList.remove('crashes--pending');
      if (!summary) {
        line.remove();
        return;
      }
      if (summary.crashes === 0) {
        line.textContent = 'No reported crashes in the last ' + CRASH_MONTHS / 12 + ' years (FMCSA Crash file).';
        return;
      }
      const plus = summary.capped ? '+' : '';
      line.dataset['tone'] = summary.fatalities > 0 ? 'danger' : 'warn';
      line.replaceChildren(
        el('strong', {}, formatNumber(summary.crashes) + plus + ' reported crash' + (summary.crashes === 1 ? '' : 'es')),
        ' in the last ' + CRASH_MONTHS / 12 + ' years · ' +
          formatNumber(summary.fatalities) + ' fatal · ' +
          formatNumber(summary.injuries) + ' injured · ' +
          formatNumber(summary.towAways) + ' towed away. ',
        el('span', { class: 'muted' }, 'Fleet-wide, not specific to one truck.'),
      );
    })
    .catch(() => line.remove());
  return line;
}

function money(usd: number): string {
  return '$' + usd.toLocaleString('en-US');
}

/** Insurance filings on record, filled in when the FMCSA insurance file answers. */
export function insuranceLine(carrier: CarrierProfile): HTMLElement {
  const block = el('div', { class: 'insurance insurance--pending' }, 'Checking insurance filings…');
  void getInsurance(carrier.dotNumber)
    .then((summary) => {
      block.classList.remove('insurance--pending');
      if (!summary) {
        block.remove();
        return;
      }
      if (summary.policies.length === 0) {
        const forHire = carrier.docketPrefix === 'MC' && carrier.status === 'A';
        block.textContent = forHire
          ? 'No active insurance filing is on record for this for-hire carrier (FMCSA).'
          : 'No insurance filing on record. Private and some exempt carriers are not required to file.';
        if (forHire) block.dataset['tone'] = 'warn';
        return;
      }
      block.replaceChildren(
        el('h4', { class: 'insurance__title' }, 'Insurance on file'),
        el(
          'ul',
          { class: 'insurance__list' },
          ...summary.policies.slice(0, 5).map((policy) =>
            el(
              'li',
              {},
              el('span', { class: 'insurance__kind' }, policy.kind),
              el('span', { class: 'insurance__limit' }, policy.limitUsd ? money(policy.limitUsd) : '—'),
              el(
                'span',
                { class: 'insurance__who' },
                [policy.insurer, policy.effectiveDate ? 'since ' + formatDate(policy.effectiveDate) : null].filter(Boolean).join(' · '),
              ),
            ),
          ),
        ),
      );
    })
    .catch(() => block.remove());
  return block;
}

function pct(rate: number): string {
  return (rate * 100).toFixed(rate < 0.1 ? 1 : 0) + '%';
}

/** Docket as FMCSA's authority files write it: prefix plus a number of at least six digits. */
export function docketKey(carrier: CarrierProfile): string | null {
  if (!carrier.docketNumber || !carrier.docketPrefix) return null;
  return carrier.docketPrefix + carrier.docketNumber.padStart(6, '0');
}

/** Out-of-service orders, revocations, authority age and SMS measures for a carrier. */
export function standingBlock(carrier: CarrierProfile): HTMLElement {
  const block = el('div', { class: 'standing standing--pending' }, 'Checking regulatory standing…');
  void getCarrierStanding(carrier.dotNumber, docketKey(carrier))
    .then((standing) => {
      block.classList.remove('standing--pending');
      if (!standing) {
        block.remove();
        return;
      }
      const rows: Array<[string, Node | string, string?]> = [];
      const active = standing.oosOrders.find((order) => order.active);
      if (active) {
        rows.push([
          'Out-of-service order',
          'ACTIVE' + (active.date ? ' since ' + formatDate(active.date) : '') + (active.reason ? ' · ' + active.reason : ''),
          'danger',
        ]);
      } else if (standing.oosOrders.length > 0) {
        const last = standing.oosOrders[0];
        rows.push(['Out-of-service order', 'None active · past order' + (last?.date ? ' ' + formatDate(last.date) : '') + (last?.reason ? ' (' + last.reason + ')' : '')]);
      } else {
        rows.push(['Out-of-service order', 'None on record']);
      }
      if (standing.revocations.length > 0) {
        const latest = standing.revocations[0];
        rows.push([
          'Authority revoked',
          standing.revocations.length + '× · latest ' + (latest?.kind.toLowerCase() ?? '') + (latest?.effectiveDate ? ' ' + formatDate(latest.effectiveDate) : ''),
          standing.revocations.some((r) => /involuntary/i.test(r.kind)) ? 'warn' : undefined,
        ]);
      }
      if (standing.authoritySince) rows.push(['Authority since', formatDate(standing.authoritySince)]);
      const sms = standing.sms;
      if (sms && sms.vehicleInspections > 0 && sms.vehicleOosRate !== null) {
        rows.push([
          'Vehicle out-of-service rate',
          pct(sms.vehicleOosRate) + ' (' + formatNumber(sms.vehicleOosInspections) + ' of ' + formatNumber(sms.vehicleInspections) + ' inspections) · national ≈ ' + pct(NATIONAL_VEHICLE_OOS_RATE),
          sms.vehicleOosRate >= NATIONAL_VEHICLE_OOS_RATE * 1.5 ? 'warn' : undefined,
        ]);
        if (sms.driverOosRate !== null) {
          rows.push(['Driver out-of-service rate', pct(sms.driverOosRate) + ' (' + formatNumber(sms.driverOosInspections) + ' of ' + formatNumber(sms.driverInspections) + ')']);
        }
        rows.push([
          'FMCSA alerts',
          sms.alerts.length > 0 ? sms.alerts.join(', ') : 'None over threshold',
          sms.alerts.length > 0 ? 'warn' : undefined,
        ]);
      }
      block.replaceChildren(
        el('h4', { class: 'standing__title' }, 'Regulatory standing'),
        el(
          'dl',
          { class: 'standing__list' },
          ...rows.map(([label, value, tone]) =>
            el('div', { 'data-tone': tone }, el('dt', {}, label), el('dd', {}, value)),
          ),
        ),
      );
      if (rows.some(([, , tone]) => tone === 'danger')) block.dataset['tone'] = 'danger';
      else if (rows.some(([, , tone]) => tone === 'warn')) block.dataset['tone'] = 'warn';
    })
    .catch(() => block.remove());
  return block;
}

/** Carrier card used inside VIN and plate files. */
export function carrierCard(
  carrier: CarrierProfile,
  evidence: string | null,
): HTMLElement {
  const snapshot = saferSnapshotUrl(carrier.dotNumber);
  return el(
    'article',
    { class: 'carrier-card' },
    carrierLine(carrier),
    evidence ? el('p', { class: 'carrier-card__evidence' }, evidence) : null,
    carrierFacts(carrier),
    standingBlock(carrier),
    insuranceLine(carrier),
    crashLine(carrier.dotNumber),
    el(
      'p',
      { class: 'carrier-card__actions' },
      dotPivot(carrier.dotNumber, 'Open carrier file & fleet'),
      snapshot ? externalLink(snapshot, 'SAFER snapshot') : null,
    ),
  );
}
