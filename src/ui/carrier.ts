/** Carrier (USDOT) profile block, shared by VIN, plate and carrier files. */

import { CRASH_MONTHS, getCrashHistory, type CrashEvent } from '../lib/api/fmcsaCrashes';
import { getCarrierAuthority, type AuthorityEvent, type CurrentAuthority } from '../lib/api/fmcsaAuthority';
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

function carrierOperationLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const labels: Readonly<Record<string, string>> = {
    A: 'Interstate',
    B: 'Intrastate · hazardous materials',
    C: 'Intrastate · non-hazardous materials',
  };
  return labels[code.toUpperCase()] ?? code;
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

/** Census facts for a carrier; the carrier file can include the detailed MCS-150 profile. */
export function carrierFacts(carrier: CarrierProfile, detailed = false): HTMLElement | null {
  const crashRate =
    carrier.recordableCrashRate === null
      ? null
      : carrier.recordableCrashRate.toLocaleString('en-US', { maximumFractionDigits: 3 });
  const docket = docketLabel(carrier);
  const facts: Array<[string, Node | string | null]> = [
    ['Base of operations', carrierBase(carrier)],
    ['Operation', operationText(carrier)],
    ['USDOT registration', statusText(carrier.status)],
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
      'Operating authority (Census)',
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
  ];
  if (detailed) {
    facts.push(
      ['Carrier operation', carrierOperationLabel(carrier.carrierOperation)],
      [
        'Hazardous materials reported',
        carrier.hazmatIndicator?.toUpperCase() === 'Y'
          ? 'Yes'
          : carrier.hazmatIndicator?.toUpperCase() === 'N'
            ? 'No'
            : null,
      ],
      [
        'MCS-150 mileage',
        carrier.reportedMileage === null || carrier.reportedMileage === undefined
          ? null
          : formatNumber(carrier.reportedMileage) + ' miles' +
            (carrier.reportedMileageYear ? ' · ' + carrier.reportedMileageYear : ''),
      ],
      [
        'Cargo types reported',
        carrier.cargoClasses && carrier.cargoClasses.length > 0 ? carrier.cargoClasses.join(' · ') : null,
      ],
      ['Other cargo detail', carrier.otherCargoDescription ?? null],
    );
  }
  return factList(facts);
}

function crashEventRow(event: CrashEvent): HTMLElement {
  const outcomes = [
    event.fatalities > 0
      ? formatNumber(event.fatalities) + (event.fatalities === 1 ? ' fatality' : ' fatalities')
      : null,
    event.injuries > 0
      ? formatNumber(event.injuries) + (event.injuries === 1 ? ' injury' : ' injuries')
      : null,
    event.towAway ? 'tow-away' : null,
  ].filter((value): value is string => value !== null);
  return el(
    'li',
    { class: 'crashes__item' },
    el('strong', {}, formatDate(event.date)),
    el('span', {}, event.state ?? 'State not reported'),
    el('span', {}, outcomes.join(' · ') || 'No fatality, injury or tow-away flag reported'),
  );
}

/** Two-year crash totals and recent public report entries for a carrier. */
export function crashLine(dotNumber: string): HTMLElement {
  const line = el('div', { class: 'crashes crashes--pending' }, 'Checking crash history…');
  void getCrashHistory(dotNumber)
    .then((summary) => {
      line.classList.remove('crashes--pending');
      if (!summary) {
        line.remove();
        return;
      }
      if (summary.crashes === 0) {
        line.textContent = 'No reported crash records in the last ' + CRASH_MONTHS / 12 + ' years (FMCSA Crash file).';
        return;
      }
      const plus = summary.capped ? '+' : '';
      line.dataset['tone'] = summary.fatalities > 0 ? 'danger' : 'warn';
      const children: Node[] = [
        el('p', { class: 'crashes__summary' },
          el('strong', {}, formatNumber(summary.crashes) + plus + ' reported crash incident' + (summary.crashes === 1 ? '' : 's')),
          ' in the last ' + CRASH_MONTHS / 12 + ' years · ' +
            formatNumber(summary.fatalities) + (summary.fatalities === 1 ? ' fatality' : ' fatalities') + ' · ' +
            formatNumber(summary.injuries) + (summary.injuries === 1 ? ' injury' : ' injuries') + ' · ' +
            formatNumber(summary.towAways) + ' tow-away record' + (summary.towAways === 1 ? '' : 's') + '.',
        ),
      ];
      if (summary.events.length > 0) {
        const rows = summary.events.slice(0, 8).map(crashEventRow);
        const details = el(
          'details',
          { class: 'crashes__history' },
          el('summary', {}, 'View ' + formatNumber(summary.events.length) + ' recent incident records'),
          el('ol', { class: 'crashes__list' }, ...rows),
          summary.events.length > rows.length
            ? el('p', { class: 'muted' }, 'Showing the 8 most recent; ' + formatNumber(summary.events.length - rows.length) + ' older entries are not expanded here.')
            : null,
        );
        children.push(details);
      }
      children.push(
        el(
          'p',
          { class: 'crashes__foot muted' },
          'Carrier-wide, not tied to a particular truck here. Reported involvement does not determine fault; public records may lag or omit incidents. ',
          el('a', {
            href: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
            target: '_blank',
            rel: 'noopener noreferrer',
          }, 'About the FMCSA Crash File ↗'),
        ),
      );
      line.replaceChildren(...children);
    })
    .catch(() => line.remove());
  return line;
}

function money(usd: number): string {
  return '$' + usd.toLocaleString('en-US');
}

/** Current insurance filings and, on the carrier file, a collapsed public filing history. */
export function insuranceLine(carrier: CarrierProfile, includeHistory = false): HTMLElement {
  const block = el('div', { class: 'insurance insurance--pending' }, 'Checking insurance filings…');
  void getInsurance(carrier.dotNumber)
    .then((summary) => {
      block.classList.remove('insurance--pending');
      if (!summary) {
        block.remove();
        return;
      }
      if (summary.currentSource === 'Legacy L&I') {
        block.dataset['tone'] = 'warn';
      }
      const policyItems = summary.policies.slice(0, 8).map((policy) =>
        el(
          'li',
          {},
          el('span', { class: 'insurance__kind' }, policy.kind),
          el('span', { class: 'insurance__limit' }, policy.limitUsd ? money(policy.limitUsd) : 'Amount not listed'),
          el(
            'span',
            { class: 'insurance__who' },
            [
              policy.insurer,
              policy.effectiveDate ? (policy.filingStatusReason ? 'pending from ' : 'effective ') + formatDate(policy.effectiveDate) : null,
              policy.filedDate ? 'filed ' + formatDate(policy.filedDate) : null,
              policy.cancelDate ? 'cancellation effective ' + formatDate(policy.cancelDate) : null,
            ].filter(Boolean).join(' · '),
          ),
        ),
      );
      const children: Node[] = [];
      if (summary.policies.length > 0) {
        const title = summary.currentSource === 'Legacy L&I'
          ? 'Legacy insurance record · archive through May 14, 2026'
          : 'Insurance filings on file · FMCSA Motus';
        children.push(el('h4', { class: 'insurance__title' }, title));
        children.push(el('ul', { class: 'insurance__list' }, ...policyItems));
        children.push(
          el(
            'p',
            { class: 'insurance__note' },
            summary.currentSource === 'Legacy L&I'
              ? 'This older L&I file may not include later Motus filings. These rows are historical context, not confirmation of current coverage.'
              : 'Amounts are FMCSA filing values, not a copy of the insurance contract or a guarantee of available coverage.',
          ),
        );
      } else {
        children.push(el('h4', { class: 'insurance__title' }, 'Insurance filing check'));
        const note = summary.currentSource === 'Unavailable'
          ? 'The current FMCSA Motus insurance file could not be read, so this check is unavailable.'
          : 'FMCSA Motus returned no current insurance filing. Some carriers are not required to file; confirm the carrier’s requirements and current record in Motus before treating this as a gap.';
        children.push(el('p', { class: 'insurance__note' }, note));
      }
      if (includeHistory && summary.history.length > 0) {
        const historyRows = summary.history.slice(0, 8).map((policy) =>
          el(
            'li',
            {},
            el('strong', {}, policy.kind),
            el(
              'span',
              {},
              [
                policy.insurer,
                policy.effectiveDate ? 'effective ' + formatDate(policy.effectiveDate) : null,
                policy.cancelDate ? 'ended ' + formatDate(policy.cancelDate) : null,
                policy.filingStatusReason,
              ].filter(Boolean).join(' · ') || 'No additional filing detail',
            ),
          ),
        );
        children.push(
          el(
            'details',
            { class: 'insurance__history' },
            el('summary', {}, 'Insurance filing history · ' + formatNumber(summary.history.length)),
            el('ul', { class: 'insurance__history-list' }, ...historyRows),
            summary.history.length > historyRows.length
              ? el('p', { class: 'insurance__note' }, 'Showing the 8 most recent entries.')
              : null,
          ),
        );
      }
      block.replaceChildren(...children);
      if (includeHistory && summary.historySource === 'Motus' && summary.history.length === 0) {
        block.append(el('p', { class: 'insurance__note' }, 'No prior insurance filings were returned by the public Motus history file.'));
      }
    })
    .catch(() => block.remove());
  return block;
}

function authorityFilingSummary(authority: CurrentAuthority): string[] {
  const details: string[] = [];
  if (authority.minimumBipdUsd !== null || authority.bipdOnFileUsd !== null) {
    details.push(
      'BIPD required ' + (authority.minimumBipdUsd === null ? '—' : money(authority.minimumBipdUsd)) +
      ' · on file ' + (authority.bipdOnFileUsd === null ? '—' : money(authority.bipdOnFileUsd)),
    );
  }
  if (authority.cargoRequired !== null) {
    details.push('Cargo ' + (authority.cargoRequired ? 'required' : 'not required') +
      (authority.cargoOnFile === null ? '' : authority.cargoOnFile ? ' · filing on record' : ' · no filing on record'));
  }
  if (authority.bondRequired !== null) {
    details.push('Bond ' + (authority.bondRequired ? 'required' : 'not required') +
      (authority.bondOnFile === null ? '' : authority.bondOnFile ? ' · filing on record' : ' · no filing on record'));
  }
  return details;
}

function authorityHistoryRow(event: AuthorityEvent): HTMLElement {
  const title = [
    event.date ? formatDate(event.date) : 'Date not listed',
    event.docketNumber,
    event.action,
  ].filter(Boolean).join(' · ');
  const details = [
    event.reason,
    event.disposition ? 'Disposition: ' + event.disposition : null,
    event.dispositionDate ? 'disposition date ' + formatDate(event.dispositionDate) : null,
    event.source === 'Legacy archive' ? 'legacy history' : null,
  ].filter(Boolean).join(' · ');
  return el('li', {}, el('strong', {}, title), details ? el('span', {}, details) : null);
}

/** Current Motus authority records plus historical events for the carrier file. */
export function carrierAuthorityBlock(carrier: CarrierProfile): HTMLElement {
  const block = el('section', { class: 'authority authority--pending' }, 'Checking operating-authority records…');
  void getCarrierAuthority(carrier)
    .then((snapshot) => {
      block.classList.remove('authority--pending');
      if (!snapshot) {
        block.remove();
        return;
      }
      const children: Node[] = [el('h4', { class: 'authority__title' }, 'Operating authority status')];
      if (snapshot.current.length > 0) {
        children.push(
          el(
            'ul',
            { class: 'authority__current' },
            ...snapshot.current.slice(0, 8).map((authority) =>
              el(
                'li',
                {},
                el(
                  'div',
                  { class: 'authority__row' },
                  el('strong', {}, authority.docketNumber ?? 'Operating authority'),
                  authority.type ? el('span', {}, authority.type) : null,
                  el('span', { class: 'tag', 'data-tone': /active/i.test(authority.status ?? '') ? 'ok' : /pending/i.test(authority.status ?? '') ? 'warn' : 'muted' }, authority.status ?? 'Status not reported'),
                ),
                ...authorityFilingSummary(authority).map((item) => el('p', { class: 'authority__detail' }, item)),
              ),
            ),
          ),
        );
      } else {
        const docket = docketLabel(carrier);
        const status = statusText(carrier.authorityStatus);
        children.push(
          el(
            'p',
            { class: 'authority__fallback' },
            snapshot.currentFileResponded
              ? 'Motus did not return a current authority row for this USDOT. Company Census lists '
              : 'The current Motus file could not be read. Company Census lists ',
            docket ? docket + (status ? ' · ' + status : '') : status ?? 'no operating-authority status',
            '.',
          ),
        );
      }

      if (snapshot.history.length > 0) {
        const shown = snapshot.history.slice(0, 8);
        children.push(
          el(
            'details',
            { class: 'authority__history' },
            el('summary', {}, 'Past authority events · ' + formatNumber(snapshot.history.length)),
            el('ol', {}, ...shown.map(authorityHistoryRow)),
            snapshot.history.length > shown.length
              ? el('p', { class: 'authority__detail' }, 'Showing the 8 most recent events.')
              : null,
          ),
        );
      } else {
        children.push(
          el(
            'p',
            { class: 'authority__detail' },
            snapshot.historyFileResponded
              ? 'No authority-history events were returned by the public files queried.'
              : 'Public authority history could not be loaded for this carrier.',
          ),
        );
      }
      children.push(
        el(
          'p',
          { class: 'authority__foot' },
          'USDOT registration and operating authority are separate statuses. Past revocation entries do not by themselves describe the current status. ',
          el('a', {
            href: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
            target: '_blank',
            rel: 'noopener noreferrer',
          }, 'FMCSA data notes ↗'),
        ),
      );
      block.replaceChildren(...children);
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
        rows.push([
          'Out-of-service orders',
          'None active · ' + formatNumber(standing.oosOrders.length) + ' prior' +
            (last?.date ? ' · latest ' + formatDate(last.date) : '') +
            (last?.rescindDate ? ' · rescinded ' + formatDate(last.rescindDate) : '') +
            (last?.reason ? ' · ' + last.reason : ''),
        ]);
      } else {
        rows.push(['Out-of-service orders', 'None listed in the FMCSA New Entrant orders file']);
      }
      if (standing.revocations.length > 0) {
        const latest = standing.revocations[0];
        rows.push([
          'Prior authority actions',
          formatNumber(standing.revocations.length) + ' historical revocation entr' +
            (standing.revocations.length === 1 ? 'y' : 'ies') +
            (latest?.kind ? ' · latest: ' + latest.kind.toLowerCase() : '') +
            (latest?.effectiveDate ? ' · effective ' + formatDate(latest.effectiveDate) : ''),
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
        el(
          'p',
          { class: 'standing__foot' },
          'Past authority actions are historical records. Check the current USDOT and operating authority statuses above; SMS indicators are not a safety rating.',
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
