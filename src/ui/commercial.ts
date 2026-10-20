/** FMCSA roadside history, joined by exact VIN and inspected unit ID. */

import type { CommercialInspection, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';

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
      el('span', { class: 'fmcsa-carrier__status' }, 'Current census code ' + record.carrierStatusCode),
    );
  }
  return el('div', { class: 'fmcsa-carrier' }, ...parts);
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
      'Inspection sites are historical observations, not a current GPS location. FMCSA data may lag reporting and older inspections can fall outside the published history window. Data files: ',
      el('a', { href: 'https://data.transportation.gov/d/wt8s-2hbx', target: '_blank', rel: 'noopener noreferrer' }, 'Inspections per Unit'),
      ' · ',
      el('a', { href: 'https://data.transportation.gov/d/fx4q-ay7w', target: '_blank', rel: 'noopener noreferrer' }, 'Vehicle Inspection File'),
      ' · ',
      el('a', { href: 'https://data.transportation.gov/d/876r-jsdb', target: '_blank', rel: 'noopener noreferrer' }, 'Vehicle Inspections and Violations'),
      ' · ',
      el('a', { href: 'https://data.transportation.gov/d/az4n-8mr2', target: '_blank', rel: 'noopener noreferrer' }, 'Company Census status'),
      '.',
    ),
  );
}
