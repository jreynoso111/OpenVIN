/** FMCSA roadside history, joined by exact VIN and inspected unit ID. */

import type { CommercialInspection, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';

function saferSnapshotUrl(dot: string | null): string | null {
  if (!dot || !/^\d+$/.test(dot)) return null;
  const params = new URLSearchParams({
    query_param: 'USDOT',
    query_string: dot,
    query_type: 'queryCarrierSnapshot',
    searchtype: 'ANY',
  });
  return 'https://safer.fmcsa.dot.gov/query.asp?' + params.toString();
}

function statusLabel(code: string | null): string | null {
  if (!code) return null;
  return code === 'A' ? 'Active (A)' : code;
}

function metric(label: string, value: string, detail: string): HTMLElement {
  return el(
    'div',
    { class: 'fmcsa-metric' },
    el('span', { class: 'fmcsa-metric__label' }, label),
    el('strong', { class: 'fmcsa-metric__value' }, value),
    el('span', { class: 'fmcsa-metric__detail' }, detail),
  );
}

function carrierCell(record: CommercialInspection): HTMLElement {
  const parts: Node[] = [];
  parts.push(
    el(
      'span',
      { class: 'fmcsa-carrier__name' },
      record.carrierDotNumber ? 'USDOT ' + record.carrierDotNumber : 'USDOT not returned',
    ),
  );
  if (record.carrierStatusCode) {
    parts.push(
      el('span', { class: 'fmcsa-carrier__status' }, 'FMCSA census: ' + statusLabel(record.carrierStatusCode)),
    );
  }
  const snapshotUrl = saferSnapshotUrl(record.carrierDotNumber);
  if (snapshotUrl) {
    parts.push(
      el(
        'a',
        { class: 'fmcsa-link', href: snapshotUrl, target: '_blank', rel: 'noopener noreferrer' },
        'SAFER snapshot',
      ),
    );
  }
  return el('div', { class: 'fmcsa-carrier' }, ...parts);
}

function carrierFact(label: string, value: string): HTMLElement {
  return el('div', {}, el('dt', {}, label), el('dd', {}, value));
}

function carrierProfiles(records: readonly CommercialInspection[]): HTMLElement | null {
  const unique = new Map<string, CommercialInspection>();
  for (const record of records) {
    if (record.carrierDotNumber && !unique.has(record.carrierDotNumber)) {
      unique.set(record.carrierDotNumber, record);
    }
  }
  if (unique.size === 0) return null;

  const cards = [...unique.values()].map((record) => {
    const dot = record.carrierDotNumber;
    const authority = [record.carrierDocketPrefix, record.carrierDocketNumber]
      .filter((part): part is string => Boolean(part))
      .join(' ');
    const crashRate =
      record.carrierRecordableCrashRate === null
        ? null
        : record.carrierRecordableCrashRate.toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          });
    const facts: Array<[string, string | null]> = [
      ['Census status', statusLabel(record.carrierStatusCode)],
      ['Operation class', record.carrierOperationClass],
      ['Reported truck units', record.carrierTruckUnits === null ? null : formatNumber(record.carrierTruckUnits)],
      ['Reported power units', record.carrierPowerUnits === null ? null : formatNumber(record.carrierPowerUnits)],
      ['Authority docket', authority || null],
      ['Authority status', statusLabel(record.carrierAuthorityStatusCode)],
      ['FMCSA safety rating', record.carrierSafetyRating],
      ['Rating date', record.carrierSafetyRatingDate ? formatDate(record.carrierSafetyRatingDate) : null],
      ['MCS-150 update', record.carrierMcs150Date ? formatDate(record.carrierMcs150Date) : null],
      ['Reported crash-rate field', crashRate],
    ];
    const snapshotUrl = saferSnapshotUrl(dot);
    return el(
      'article',
      { class: 'fmcsa-carrier-card' },
      el(
        'div',
        { class: 'fmcsa-carrier-card__header' },
        el('h4', {}, 'USDOT ' + dot),
        el('span', { class: 'fmcsa-table__secondary' }, 'Carrier recorded on VIN-matched inspection(s)'),
      ),
      el(
        'dl',
        { class: 'fmcsa-carrier-facts' },
        ...facts
          .filter((fact): fact is [string, string] => fact[1] !== null)
          .map(([label, value]) => carrierFact(label, value)),
      ),
      snapshotUrl
        ? el(
            'a',
            { class: 'fmcsa-link', href: snapshotUrl, target: '_blank', rel: 'noopener noreferrer' },
            'Open official SAFER Company Snapshot',
          )
        : null,
    );
  });

  return el(
    'section',
    { class: 'fmcsa-carrier-section' },
    el('h3', {}, 'Carrier cross-reference'),
    el(
      'p',
      { class: 'fmcsa-section-note' },
      'FMCSA census fields describe the carrier, not this individual truck. Open the official Snapshot to review its business identity; High View does not copy names, contact details, addresses, or person records into this report.',
    ),
    el('div', { class: 'fmcsa-carrier-grid' }, ...cards),
    el(
      'p',
      { class: 'fmcsa-section-note' },
      'A carrier seen on a past inspection may not own or currently operate the vehicle. Fleet counts and crash-rate fields are carrier-level census data, not a live fleet inventory or a truck-specific score.',
    ),
  );
}

function plateObservations(records: readonly CommercialInspection[]): HTMLElement | null {
  const observations = new Map<
    string,
    { plate: string; state: string | null; count: number; latest: CommercialInspection | null }
  >();
  for (const record of records) {
    if (!record.plate && !record.plateState) continue;
    const key = (record.plate ?? '') + '|' + (record.plateState ?? '');
    const item = observations.get(key) ?? {
      plate: record.plate ?? 'Plate not returned',
      state: record.plateState,
      count: 0,
      latest: null,
    };
    item.count += 1;
    if (!item.latest || (record.date && (!item.latest.date || record.date > item.latest.date))) {
      item.latest = record;
    }
    observations.set(key, item);
  }
  if (observations.size === 0) return null;

  const cards = [...observations.values()]
    .sort((a, b) => (b.latest?.date ?? '').localeCompare(a.latest?.date ?? ''))
    .map((item) =>
      el(
        'article',
        { class: 'fmcsa-plate-card' },
        el('strong', {}, item.plate),
        el('span', { class: 'fmcsa-plate-card__state' }, item.state ?? 'Issuing state not reported'),
        el(
          'span',
          { class: 'fmcsa-table__secondary' },
          'Last observed ' + (item.latest?.date ? formatDate(item.latest.date) : 'date unavailable'),
        ),
        el(
          'span',
          { class: 'fmcsa-table__secondary' },
          formatNumber(item.count) + ' matched inspection' + (item.count === 1 ? '' : 's'),
        ),
      ),
    );

  return el(
    'section',
    { class: 'fmcsa-plate-section' },
    el('h3', {}, 'Plate observations'),
    el(
      'p',
      { class: 'fmcsa-section-note' },
      'These plate and state pairs were recorded during historical roadside inspections. They are search leads, not confirmation of current registration or ownership.',
    ),
    el('div', { class: 'fmcsa-plate-grid' }, ...cards),
  );
}

function vehicleFindingsCell(record: CommercialInspection): HTMLElement {
  const vehicleCount =
    record.vehicleViolations === null
      ? 'Vehicle violations: not reported'
      : 'Vehicle violations: ' + formatNumber(record.vehicleViolations);
  const vehicleOos =
    record.vehicleOutOfService === null
      ? 'vehicle OOS: not reported'
      : record.vehicleOutOfService > 0
        ? 'vehicle OOS: yes'
        : 'vehicle OOS: no';

  const content: Node[] = [
    el('p', { class: 'fmcsa-findings__count' }, vehicleCount + ' · ' + vehicleOos),
  ];

  if (record.vehicleFindings.length > 0) {
    const details = el(
      'details',
      { class: 'fmcsa-findings__details' },
      el(
        'summary',
        {},
        'View ' +
          formatNumber(record.vehicleFindings.length) +
          ' matched vehicle violation' +
          (record.vehicleFindings.length === 1 ? '' : 's'),
      ),
    );
    const list = el('ul', { class: 'fmcsa-findings__list' });
    for (const finding of record.vehicleFindings) {
      const label = [finding.code, finding.description, finding.part ? 'Part ' + finding.part : null]
        .filter((part): part is string => Boolean(part))
        .join(' · ');
      list.append(
        el(
          'li',
          {},
          el('span', {}, label || 'FMCSA vehicle finding'),
          finding.outOfService
            ? el('span', { class: 'fmcsa-oos-badge' }, 'Vehicle OOS')
            : null,
        ),
      );
    }
    details.append(list);
    content.push(details);
  } else if ((record.vehicleViolations ?? 0) > 0) {
    content.push(
      el(
        'p',
        { class: 'fmcsa-findings__note' },
        'FMCSA reported vehicle violations, but did not return matching unit-level descriptions.',
      ),
    );
  }

  if (record.inspectionViolations !== null || record.inspectionOutOfService !== null) {
    content.push(
      el(
        'p',
        { class: 'fmcsa-findings__context' },
        'Inspection total (all categories, not vehicle-only): ' +
          formatNumber(record.inspectionViolations) +
          ' violations · ' +
          formatNumber(record.inspectionOutOfService) +
          ' OOS across inspected units.',
      ),
    );
  }

  return el('div', { class: 'fmcsa-findings' }, ...content);
}

function row(record: CommercialInspection): HTMLTableRowElement {
  const location = record.location
    ? el('span', { class: 'fmcsa-table__secondary' }, record.location)
    : null;
  const jurisdiction = el(
    'div',
    { class: 'fmcsa-location' },
    el('strong', {}, record.state ?? 'State not reported'),
    location,
    record.level ? el('span', { class: 'fmcsa-table__secondary' }, 'Inspection level ' + record.level) : null,
  );
  const plate = [record.plate, record.plateState ? '(' + record.plateState + ')' : null]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  const dateCell = el(
    'div',
    { class: 'fmcsa-date' },
    record.date
      ? el(
          'time',
          { datetime: record.date, class: 'fmcsa-table__date' },
          formatDate(record.date),
        )
      : el('span', { class: 'fmcsa-table__secondary' }, 'Date not joined'),
    el('span', { class: 'fmcsa-table__secondary' }, 'FMCSA ' + record.inspectionId),
  );

  return el(
    'tr',
    {},
    el('td', {}, dateCell),
    el('td', {}, jurisdiction),
    el('td', {}, carrierCell(record)),
    el('td', {}, plate || 'No plate returned'),
    el('td', {}, vehicleFindingsCell(record)),
  );
}

export function renderCommercialInspections(
  result: SectionResult<CommercialInspection[]>,
): HTMLElement {
  const records = result.data ?? [];
  if (records.length === 0) {
    return el(
      'div',
      { class: 'fmcsa-empty card' },
      el(
        'p',
        { class: 'note' },
        result.status === 'miss'
          ? 'FMCSA returned no exact-VIN roadside inspection match in its current files.'
          : 'The FMCSA inspection data could not be loaded. Retry the VIN search later.',
      ),
      el(
        'p',
        { class: 'note note--micro' },
        'This source covers reported commercial roadside inspections, not every state record or the vehicle’s current location.',
      ),
    );
  }

  const carriers = new Set(
    records.map((record) => record.carrierDotNumber).filter((dot): dot is string => Boolean(dot)),
  );
  const plates = new Set(
    records
      .map((record) => {
        if (!record.plate && !record.plateState) return null;
        return (record.plate ?? '') + '|' + (record.plateState ?? '');
      })
      .filter((plate): plate is string => plate !== null),
  );
  const vehicleOos = records.filter((record) => (record.vehicleOutOfService ?? 0) > 0).length;

  const metrics = el(
    'div',
    { class: 'fmcsa-summary' },
    metric('VIN-matched inspections', formatNumber(records.length), 'in FMCSA’s current history window'),
    metric('USDOT carriers', formatNumber(carriers.size), 'associated with this VIN in these records'),
    metric('Plates observed', formatNumber(plates.size), 'plate and state combinations'),
    metric('Vehicle OOS events', formatNumber(vehicleOos), 'historical inspection outcomes'),
  );

  const table = el(
    'table',
    { class: 'fmcsa-table' },
    el(
      'caption',
      { class: 'visually-hidden' },
      'FMCSA roadside inspection history matched to this vehicle identification number',
    ),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { scope: 'col' }, 'Inspection date'),
        el('th', { scope: 'col' }, 'State and site'),
        el('th', { scope: 'col' }, 'Carrier'),
        el('th', { scope: 'col' }, 'Plate observed'),
        el('th', { scope: 'col' }, 'Vehicle findings'),
      ),
    ),
  );
  const body = el('tbody');
  for (const record of records) body.append(row(record));
  table.append(body);

  return el(
    'div',
    { class: 'fmcsa-history' },
    metrics,
    plateObservations(records),
    carrierProfiles(records),
    result.status === 'unavailable'
      ? el('p', { class: 'fmcsa-partial-warning' }, result.note ?? 'Some FMCSA details are unavailable.')
      : null,
    el(
      'div',
      { class: 'fmcsa-table-wrap', tabindex: '0', 'aria-label': 'Scrollable FMCSA inspection table' },
      table,
    ),
    el(
      'p',
      { class: 'fmcsa-footnote' },
      'Inspection sites and plates are historical observations, not live tracking or proof of current registration. FMCSA data may lag reporting and older inspections can fall outside the published history window. Company Census fleet and safety fields describe the carrier. Data files: ',
      el('a', { href: 'https://data.transportation.gov/d/wt8s-2hbx', target: '_blank', rel: 'noopener noreferrer' }, 'Inspections per Unit'),
      ' · ',
      el('a', { href: 'https://data.transportation.gov/d/fx4q-ay7w', target: '_blank', rel: 'noopener noreferrer' }, 'Vehicle Inspection File'),
      ' · ',
      el('a', { href: 'https://data.transportation.gov/d/876r-jsdb', target: '_blank', rel: 'noopener noreferrer' }, 'Vehicle Inspections and Violations'),
      ' · ',
      el('a', { href: 'https://data.transportation.gov/d/az4n-8mr2', target: '_blank', rel: 'noopener noreferrer' }, 'Company Census'),
      ' · ',
      el('a', { href: 'https://safer.fmcsa.dot.gov/CompanySnapShot.aspx', target: '_blank', rel: 'noopener noreferrer' }, 'SAFER Company Snapshot'),
      '.',
    ),
  );
}
