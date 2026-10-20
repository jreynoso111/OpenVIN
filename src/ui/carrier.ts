/** Carrier (USDOT) profile block, shared by VIN, plate and carrier files. */

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
    el(
      'p',
      { class: 'carrier-card__actions' },
      dotPivot(carrier.dotNumber, 'Open carrier file & fleet'),
      snapshot ? externalLink(snapshot, 'SAFER snapshot') : null,
    ),
  );
}
