/**
 * Carrier file (USDOT or MC): census profile, operating area, and the fleet
 * recorded on its most recent roadside inspections — every VIN and plate
 * linked to its own file. Name searches list matching business carriers.
 */

import { getCarrierFleet, getCarriersById, searchCarriersByName } from '../lib/api/fmcsaLookup';
import type { CarrierFleet, CarrierProfile, FleetVehicle, SectionResult } from '../lib/types';
import { ageLabel, el, formatDate, formatNumber } from './dom';
import { caseHeader, caseLayout, limitsNote } from './case';
import { carrierAuthorityBlock, carrierBase, carrierFacts, crashLine, insuranceLine, standingBlock, carrierLine, carrierName, docketLabel, operationText } from './carrier';
import { createLedger, createPanel, emptyNote } from './panel';
import { externalLink, platePivot, saferSnapshotUrl, vinPivot } from './pivot';
import { frequencyList, lastSeen, placeText } from './sightings';
import { renderStateMap } from './stateMap';

function failure<T>(name: string): SectionResult<T> {
  return { status: 'unavailable', source: { name }, note: 'The lookup failed.' };
}

function matchesFilter(vehicle: FleetVehicle, term: string): boolean {
  if (!term) return true;
  const haystack = [vehicle.vin, vehicle.make, vehicle.unitType, ...vehicle.plates, ...vehicle.companyUnits]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[\s-]/g, '');
  return haystack.includes(term.toUpperCase().replace(/[\s-]/g, ''));
}

type FleetSortKey = 'vin' | 'plates' | 'unit' | 'lastInspection' | 'result' | 'inspectionCount';
type FleetSortValue = string | number | null;
type FleetSortDirection = 'ascending' | 'descending';

const fleetSortColumns: Array<{ key: FleetSortKey; label: string }> = [
  { key: 'vin', label: 'VIN' },
  { key: 'plates', label: 'Plates' },
  { key: 'unit', label: 'Unit #' },
  { key: 'lastInspection', label: 'Last inspection' },
  { key: 'result', label: 'Result' },
  { key: 'inspectionCount', label: 'Inspection count' },
];

function fleetSortValue(vehicle: FleetVehicle, key: FleetSortKey): FleetSortValue {
  switch (key) {
    case 'vin':
      return vehicle.vin;
    case 'plates':
      return vehicle.plates.join(' ') || null;
    case 'unit':
      return vehicle.companyUnits.join(' ') || null;
    case 'lastInspection': {
      // The most recent inspection on record, whichever carrier it was under.
      const dates = [vehicle.lastSeen.date, vehicle.latestInspection?.date ?? null].filter((date): date is string => Boolean(date));
      return dates.length > 0 ? dates.reduce((a, b) => (a >= b ? a : b)) : null;
    }
    case 'result':
      if (!vehicle.latestInspection || vehicle.latestInspection.vehicleOutOfService === null) return 0;
      return vehicle.latestInspection.vehicleOutOfService > 0 ? 2 : 1;
    case 'inspectionCount':
      return vehicle.inspectionCount;
  }
}

function compareFleetValues(a: FleetSortValue, b: FleetSortValue, direction: FleetSortDirection): number {
  // Keep unavailable values last in either direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const comparison = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'ascending' ? comparison : -comparison;
}

function fleetRow(vehicle: FleetVehicle, viewedDot: string): HTMLElement {
  const last = vehicle.lastSeen;
  const latest = vehicle.latestInspection;
  const currentDot = viewedDot.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const latestIsAnotherCarrier = Boolean(latest && latest.carrierDotNumber !== currentDot);
  // The place is only known for the last stop under this USDOT. Add a second
  // line only when the newest exact-VIN record is a different date or carrier.
  const latestDiffers = Boolean(latest && (latestIsAnotherCarrier || latest.date !== last.date));
  const lastAge = ageLabel(last.date);
  const latestAge = ageLabel(latest?.date ?? null);
  const inspectionResult = latest?.vehicleOutOfService === null || !latest
    ? el('span', { class: 'muted' }, 'Unavailable')
    : latest.vehicleOutOfService > 0
      ? el(
          'span',
          { class: 'tag', 'data-tone': 'danger', title: 'FMCSA recorded this exact unit as out of service during this inspection.' },
          "Didn't pass",
        )
      : el(
          'span',
          { class: 'tag', 'data-tone': 'ok', title: 'No vehicle out-of-service violation was recorded for this unit in this inspection.' },
          'Passed',
        );
  return el(
    'tr',
    {},
    el('td', { 'data-label': 'VIN' }, vinPivot(vehicle.vin), el('span', { class: 'sub' }, [vehicle.unitType, vehicle.make].filter(Boolean).join(' · '))),
    el(
      'td',
      { 'data-label': 'Plates' },
      el(
        'span',
        { class: 'stack' },
        ...vehicle.plates.slice(0, 3).map((label) => {
          const [plate = '', state = null] = label.split(' ');
          return platePivot(plate, state);
        }),
      ),
    ),
    el('td', { 'data-label': 'Unit #' }, vehicle.companyUnits.slice(0, 2).join(' · ') || '—'),
    el(
      'td',
      { 'data-label': 'Last inspection' },
      placeText(last),
      el('span', { class: 'sub' }, last.date ? [formatDate(last.date), lastAge].filter(Boolean).join(' · ') : '—'),
      latest && latestDiffers
        ? el(
            'span',
            { class: 'sub carrier-fleet__latest-carrier', 'data-tone': latestIsAnotherCarrier ? 'warn' : 'muted' },
            'Latest ' + formatDate(latest.date) + (latestAge ? ' · ' + latestAge : '') +
              (latestIsAnotherCarrier ? ' · another carrier, USDOT ' + latest.carrierDotNumber : ' · this carrier'),
          )
        : null,
    ),
    el('td', { 'data-label': 'Inspection result' }, inspectionResult),
    el('td', { 'data-label': 'Inspection count', class: 'num' }, formatNumber(vehicle.inspectionCount)),
  );
}

function fleetTable(fleet: CarrierFleet, dot: string): HTMLElement {
  if (fleet.vehicles.length === 0) return emptyNote('Inspections were found but no unit VINs were recorded on them.');
  const body = el('tbody');
  const count = el('p', { class: 'filter__count' });
  let filterTerm = '';
  let sortKey: FleetSortKey | null = null;
  let sortDirection: FleetSortDirection = 'ascending';
  let headerCells: Array<{ key: FleetSortKey; label: string; cell: HTMLTableCellElement; button: HTMLButtonElement; indicator: HTMLSpanElement }> = [];
  const render = (term: string): void => {
    filterTerm = term;
    const filtered = fleet.vehicles.filter((vehicle) => matchesFilter(vehicle, term));
    const activeSortKey = sortKey;
    const shown = activeSortKey === null
      ? filtered
      : filtered
        .map((vehicle, index) => ({ vehicle, index }))
        .sort((a, b) => compareFleetValues(fleetSortValue(a.vehicle, activeSortKey), fleetSortValue(b.vehicle, activeSortKey), sortDirection) || a.index - b.index)
        .map(({ vehicle }) => vehicle);
    body.replaceChildren(...shown.slice(0, 300).map((vehicle) => fleetRow(vehicle, dot)));
    count.textContent = formatNumber(shown.length) + ' of ' + formatNumber(fleet.vehicles.length) + ' units';
    headerCells.forEach(({ key, label, cell, button, indicator }) => {
      const active = key === sortKey;
      cell.setAttribute('aria-sort', active ? sortDirection : 'none');
      indicator.textContent = active ? (sortDirection === 'ascending' ? '↑' : '↓') : '↕';
      button.title = active
        ? label + ', sorted ' + sortDirection + '. Click to reverse.'
        : 'Sort by ' + label + ' in ascending order.';
    });
  };
  headerCells = fleetSortColumns.map(({ key, label }) => {
    const indicator = el('span', { class: 'carrier-fleet__sort-indicator', 'aria-hidden': 'true' }, '↕');
    const button = el(
      'button',
      {
        class: 'carrier-fleet__sort',
        type: 'button',
        title: 'Sort by ' + label + ' in ascending order.',
        onclick: () => {
          if (sortKey === key) sortDirection = sortDirection === 'ascending' ? 'descending' : 'ascending';
          else {
            sortKey = key;
            sortDirection = 'ascending';
          }
          render(filterTerm);
        },
      },
      label,
      indicator,
    );
    const cell = el('th', { scope: 'col', 'aria-sort': 'none' }, button);
    return { key, label, cell, button, indicator };
  });
  const input = el('input', {
    class: 'filter__input',
    type: 'search',
    placeholder: 'Filter by VIN, plate, unit # or make',
    'aria-label': 'Filter fleet',
    oninput: (event: Event) => render((event.target as HTMLInputElement).value.trim()),
  });
  render('');
  return el(
    'div',
    {},
    el(
      'p',
      { class: 'panel__hint fleet__explanation' },
      'A VIN appears here when an FMCSA roadside inspection lists it under USDOT ' + dot +
        '. When a newer exact-VIN record exists, the last-inspection column adds a “Latest” line comparing records across carriers in the available FMCSA files; “another carrier” identifies the USDOT on that record, not the vehicle’s current operator or ownership. Result refers to that latest record and is based on vehicle out-of-service findings: Passed means none were recorded; Didn’t pass means FMCSA recorded the unit as out of service. Inspection count is the number of distinct records for this USDOT in the date range below.',
    ),
    el('div', { class: 'filter' }, input, count),
    el(
      'div',
      { class: 'log-wrap', tabindex: '0', 'aria-label': 'Vehicles recorded on roadside inspections' },
      el(
        'table',
        { class: 'log' },
        el('caption', { class: 'visually-hidden' }, 'Vehicles recorded on roadside inspections under this USDOT number'),
        el('thead', {}, el('tr', {}, ...headerCells.map(({ cell }) => cell))),
        body,
      ),
    ),
    el(
      'p',
      { class: 'panel__foot' },
      'From the ' + formatNumber(fleet.inspectionsScanned) + ' most recent inspections' +
        (fleet.oldestDate && fleet.newestDate ? ' (' + formatDate(fleet.oldestDate) + ' – ' + formatDate(fleet.newestDate) + ')' : '') +
        (fleet.truncated ? '. Older inspections were not scanned.' : '.'),
    ),
  );
}

function carrierList(carriers: readonly CarrierProfile[]): HTMLElement {
  return el(
    'ol',
    { class: 'results' },
    ...carriers.map((carrier) =>
      el(
        'li',
        { class: 'results__row' },
        carrierLine(carrier),
        el(
          'span',
          { class: 'results__meta' },
          [carrierBase(carrier), carrier.powerUnits !== null ? formatNumber(carrier.powerUnits) + ' power units' : null, operationText(carrier)]
            .filter(Boolean)
            .join(' · '),
        ),
      ),
    ),
  );
}

/** Name / DBA search results. */
export function renderNameResults(main: HTMLElement, term: string, isCurrent: () => boolean): void {
  const header = caseHeader('Company search', term, 'Carriers matching “' + term + '”');
  const results = createPanel({ id: 'name-results', title: 'Matching carriers', hint: 'Legal name or DBA contains every word. Active carriers first.', lines: 5 });
  const ledger = createLedger();
  ledger.add('census', 'Company Census · FMCSA');
  main.replaceChildren(
    caseLayout(header.root, [results.root], [
      ledger.root,
      limitsNote('Only business entities are listed by name. Individual owner-operators can still be found by USDOT number, VIN or plate.'),
    ]),
  );
  void searchCarriersByName(term)
    .catch(() => failure<CarrierProfile[]>('FMCSA Company Census'))
    .then((result) => {
      if (!isCurrent()) return;
      const carriers = result.data ?? [];
      ledger.set('census', result.status, result.source, carriers.length > 0 ? formatNumber(carriers.length) + ' matches' : undefined);
      header.setBody(el('p', { class: 'case__summary' }, carriers.length > 0 ? formatNumber(carriers.length) + ' carrier' + (carriers.length === 1 ? '' : 's') + (carriers.length >= 40 ? ' (first 40 — add a word to narrow)' : '') : result.note ?? ''));
      results.fill(carriers.length > 0 ? carrierList(carriers) : emptyNote(result.note ?? 'No matches.'));
    });
}

/** USDOT or MC file. */
export function renderCarrierFile(
  main: HTMLElement,
  kind: 'dot' | 'mc',
  number: string,
  isCurrent: () => boolean,
): void {
  const header = caseHeader('Carrier file', (kind === 'dot' ? 'USDOT ' : 'MC ') + number);
  const area = createPanel({ id: 'carrier-area', title: 'Operating area', hint: 'Where its units were stopped on recent inspections.', lines: 3 });
  const fleet = createPanel({ id: 'carrier-fleet', title: 'Fleet seen at roadside', hint: 'Search by VIN, plate, unit number or make.', lines: 6 });
  const profile = createPanel({
    id: 'carrier-profile',
    title: 'Census profile',
    hint: 'FMCSA registration, cargo and MCS-150 details reported on the carrier record; fields can have different update dates.',
    lines: 4,
  });
  const ledger = createLedger();
  ledger.add('census', 'Company Census · FMCSA');
  ledger.add('fleet', 'Roadside inspections · FMCSA');
  const actions = el('div');
  main.replaceChildren(
    caseLayout(header.root, [profile.root, area.root, fleet.root], [
      ledger.root,
      actions,
      limitsNote('These units were listed during roadside inspections associated with this USDOT on the dates shown. The list is not a confirmed current fleet or ownership roster; leased or sold units can still appear. Inspection count is the number of records where the VIN was listed under this USDOT.'),
    ]),
  );

  const loadFleet = (dot: string): void => {
    void getCarrierFleet(dot)
      .catch(() => failure<CarrierFleet>('FMCSA roadside inspections'))
      .then((result) => {
        if (!isCurrent()) return;
        const data = result.data;
        ledger.set('fleet', result.status, result.source, data ? formatNumber(data.inspectionsScanned) + ' inspections · ' + formatNumber(data.vehicles.length) + ' units' : undefined);
        if (!data || data.inspectionsScanned === 0) {
          area.fill(emptyNote(result.note ?? 'No roadside inspections on file.'));
          fleet.drop();
          return;
        }
        const latest = data.vehicles[0]?.lastSeen;
        area.fill(
          el(
            'div',
            { class: 'where' },
            latest ? el('div', { class: 'where__lead' }, lastSeen(latest, 'Most recent stop of any unit')) : null,
            el('div', { class: 'where__grid' }, renderStateMap(data.states, 'inspection') ?? frequencyList('States', data.states.map((s) => ({ label: s.state, count: s.count, lastDate: s.lastDate })), 8)),
          ),
        );
        fleet.fill(fleetTable(data, dot));
      });
  };

  void getCarriersById(kind, number)
    .catch(() => failure<CarrierProfile[]>('FMCSA Company Census'))
    .then((result) => {
      if (!isCurrent()) return;
      const carriers = result.data ?? [];
      ledger.set('census', result.status, result.source, carriers.length > 1 ? formatNumber(carriers.length) + ' carriers' : undefined);
      const carrier = carriers[0];
      if (!carrier) {
        header.setTitle('No carrier found');
        profile.fill(emptyNote(result.note ?? 'No carrier record.'));
        if (kind === 'dot') loadFleet(number);
        else {
          area.drop();
          fleet.drop();
          ledger.set('fleet', 'miss', null, 'Not run');
        }
        return;
      }
      if (carriers.length > 1) {
        header.setTitle(formatNumber(carriers.length) + ' carriers hold MC ' + number);
        profile.fill(carrierList(carriers));
        area.drop();
        fleet.drop();
        ledger.set('fleet', 'miss', null, 'Pick a carrier');
        return;
      }
      header.setTitle(carrierName(carrier));
      header.setBody(
        el(
          'p',
          { class: 'case__summary' },
          [carrier.dbaName && carrier.legalName ? 'DBA ' + carrier.dbaName : null, carrierBase(carrier), docketLabel(carrier), 'USDOT ' + carrier.dotNumber]
            .filter(Boolean)
            .join(' · '),
        ),
      );
      profile.fill(
        el(
          'div',
          {},
          carrierFacts(carrier, true) ?? emptyNote('No census details.'),
          carrierAuthorityBlock(carrier),
          standingBlock(carrier),
          insuranceLine(carrier, true),
          crashLine(carrier.dotNumber),
        ),
      );
      const snapshot = saferSnapshotUrl(carrier.dotNumber);
      if (snapshot) {
        const safetyProfile = 'https://ai.fmcsa.dot.gov/SMS/Carrier/' + carrier.dotNumber + '/Overview.aspx';
        actions.replaceChildren(
          el(
            'section',
            { class: 'rail-block' },
            el('h2', { class: 'rail-block__title' }, 'Official record'),
            el(
              'ul',
              { class: 'checks' },
              el('li', {}, externalLink(snapshot, 'SAFER Company Snapshot', '')),
              el('li', {}, externalLink(safetyProfile, 'FMCSA SMS & enforcement profile', '')),
              el('li', {}, externalLink(
                'https://data.transportation.gov/Trucking-and-Motorcoaches/Motus-BOC3-All-With-History/6snj-ed7q',
                'FMCSA BOC-3 public history file',
                '',
              )),
            ),
            el('p', { class: 'rail-block__note' }, 'The public BOC-3 file has no event dates or current/cancelled status, so it cannot confirm the present process-agent filing.'),
          ),
        );
      }
      loadFleet(carrier.dotNumber);
    });
}
