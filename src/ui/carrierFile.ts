/**
 * Carrier file (USDOT or MC): census profile, operating area, and the fleet
 * recorded on its most recent roadside inspections — every VIN and plate
 * linked to its own file. Name searches list matching business carriers.
 */

import { getCarrierFleet, getCarriersById, searchCarriersByName } from '../lib/api/fmcsaLookup';
import type { CarrierFleet, CarrierProfile, FleetVehicle, SectionResult } from '../lib/types';
import { ageLabel, el, formatDate, formatNumber } from './dom';
import { caseHeader, caseLayout, limitsNote } from './case';
import { carrierBase, carrierFacts, crashLine, insuranceLine, standingBlock, carrierLine, carrierName, docketLabel, operationText } from './carrier';
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

function fleetRow(vehicle: FleetVehicle): HTMLElement {
  const last = vehicle.lastSeen;
  const age = ageLabel(last.date);
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
    el('td', { 'data-label': 'Last stop' }, placeText(last), el('span', { class: 'sub' }, (last.date ? formatDate(last.date) : '—') + (age ? ' · ' + age : ''))),
    el('td', { 'data-label': 'Stops', class: 'num' }, formatNumber(vehicle.sightings)),
  );
}

function fleetTable(fleet: CarrierFleet): HTMLElement {
  if (fleet.vehicles.length === 0) return emptyNote('Inspections were found but no unit VINs were recorded on them.');
  const body = el('tbody');
  const count = el('p', { class: 'filter__count' });
  const render = (term: string): void => {
    const shown = fleet.vehicles.filter((vehicle) => matchesFilter(vehicle, term));
    body.replaceChildren(...shown.slice(0, 300).map(fleetRow));
    count.textContent = formatNumber(shown.length) + ' of ' + formatNumber(fleet.vehicles.length) + ' units';
  };
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
    el('div', { class: 'filter' }, input, count),
    el(
      'div',
      { class: 'log-wrap', tabindex: '0', 'aria-label': 'Fleet recorded at roadside inspections' },
      el(
        'table',
        { class: 'log' },
        el('caption', { class: 'visually-hidden' }, 'Units recorded on this carrier’s inspections'),
        el('thead', {}, el('tr', {}, ...['VIN', 'Plates', 'Unit #', 'Last stop', 'Stops'].map((h) => el('th', { scope: 'col' }, h)))),
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
  const fleet = createPanel({ id: 'carrier-fleet', title: 'Fleet seen at roadside', hint: 'Search a cab number, plate or partial VIN to find one truck.', lines: 6 });
  const profile = createPanel({ id: 'carrier-profile', title: 'Census profile', lines: 4 });
  const ledger = createLedger();
  ledger.add('census', 'Company Census · FMCSA');
  ledger.add('fleet', 'Roadside inspections · FMCSA');
  const actions = el('div');
  main.replaceChildren(
    caseLayout(header.root, [fleet.root, area.root, profile.root], [
      ledger.root,
      actions,
      limitsNote('Units listed were inspected under this USDOT number. Leased or sold units can still appear, and current fleet assignments are not public.'),
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
        fleet.fill(fleetTable(data));
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
        el('div', {}, carrierFacts(carrier) ?? emptyNote('No census details.'), standingBlock(carrier), insuranceLine(carrier), crashLine(carrier.dotNumber)),
      );
      const snapshot = saferSnapshotUrl(carrier.dotNumber);
      if (snapshot) {
        actions.replaceChildren(
          el(
            'section',
            { class: 'rail-block' },
            el('h2', { class: 'rail-block__title' }, 'Official record'),
            el('ul', { class: 'checks' }, el('li', {}, externalLink(snapshot, 'SAFER Company Snapshot', ''))),
          ),
        );
      }
      loadFleet(carrier.dotNumber);
    });
}
