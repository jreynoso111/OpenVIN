/**
 * Plate file: every vehicle that carried a plate in FMCSA roadside records,
 * the carriers behind it, and where the plate was stopped.
 */

import { searchByPlate, type PlateResult } from '../lib/api/fmcsaLookup';
import { getPlateCrashHistory, type PlateCrashHistory } from '../lib/api/fmcsaCrashes';
import type { SectionResult, UnitSighting } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { caseHeader, caseLayout, limitsNote } from './case';
import { carrierCard, carrierName } from './carrier';
import { createLedger, createPanel, emptyNote } from './panel';
import { dotPivot, externalLink, vinPivot } from './pivot';
import { countPlaces, frequencyChips, frequencyList, lastSeen, placeText, sightingTable } from './sightings';
import { renderStateMap, stateCounts } from './stateMap';
import { renderPlateCrashes } from './plateCrashes';
import { plateVehicleDetails } from './plateVehicleDetails';

interface VehicleUse {
  vin: string;
  make: string | null;
  unitType: string | null;
  count: number;
  first: string | null;
  last: UnitSighting;
  carriers: Set<string>;
  overlapsWith: string[];
}

export function vehiclesOnPlate(sightings: readonly UnitSighting[]): VehicleUse[] {
  const map = new Map<string, VehicleUse>();
  for (const sighting of sightings) {
    if (!sighting.vin) continue;
    const use = map.get(sighting.vin) ?? {
      vin: sighting.vin,
      make: sighting.make,
      unitType: sighting.unitType,
      count: 0,
      first: sighting.date,
      last: sighting,
      carriers: new Set<string>(),
      overlapsWith: [],
    };
    use.count += 1;
    if (sighting.date && (!use.last.date || sighting.date > use.last.date)) use.last = sighting;
    if (sighting.date && (!use.first || sighting.date < use.first)) use.first = sighting.date;
    if (sighting.carrierDotNumber) use.carriers.add(sighting.carrierDotNumber);
    map.set(sighting.vin, use);
  }
  const uses = [...map.values()].sort((a, b) => (b.last.date ?? '').localeCompare(a.last.date ?? ''));
  for (const use of uses) {
    if (!use.first || !use.last.date) continue;
    use.overlapsWith = uses
      .filter((other) => other.vin !== use.vin && other.first && other.last.date)
      .filter((other) => use.first! <= other.last.date! && other.first! <= use.last.date!)
      .map((other) => other.vin);
  }
  return uses;
}

function vehiclesTable(
  uses: readonly VehicleUse[],
  names: ReadonlyMap<string, string>,
  ledger: ReturnType<typeof createLedger>,
  isCurrent: () => boolean,
): HTMLElement {
  const table = el(
    'table',
    { class: 'log' },
    el('caption', { class: 'visually-hidden' }, 'Vehicles recorded with this plate'),
    el('thead', {}, el('tr', {}, ...['VIN', 'Unit', 'Carrier', 'Seen', 'Last stop'].map((h) => el('th', { scope: 'col' }, h)))),
  );
  const body = el('tbody');
  for (const use of uses) {
    body.append(
      el(
        'tr',
        {},
        el(
          'td',
          { 'data-label': 'VIN' },
          el(
            'span',
            { class: 'stack' },
            /^[A-HJ-NPR-Z0-9]{17}$/.test(use.vin) ? vinPivot(use.vin) : use.vin,
            plateVehicleDetails(use.vin, ledger, isCurrent),
          ),
        ),
        el(
          'td',
          { 'data-label': 'Unit' },
          use.unitType || use.make || '—',
          use.unitType && use.make ? el('span', { class: 'sub' }, use.make) : null,
        ),
        el('td', { 'data-label': 'Carrier' }, el('span', { class: 'stack' }, ...[...use.carriers].map((dot) => dotPivot(dot, names.get(dot))))),
        el(
          'td',
          { 'data-label': 'Seen / chronology' },
          formatNumber(use.count) + ' stop' + (use.count === 1 ? '' : 's'),
          el('span', { class: 'sub' }, (use.first ? formatDate(use.first) : '—') + ' – ' + (use.last.date ? formatDate(use.last.date) : '—')),
          use.overlapsWith.length > 0
            ? el('span', { class: 'sub' }, 'Date span overlaps: ', ...use.overlapsWith.map((vin, index) => el('span', {}, index ? ', ' : '', /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vinPivot(vin) : vin)))
            : el('span', { class: 'sub muted' }, 'No other VIN date span overlaps'),
        ),
        el('td', { 'data-label': 'Last stop' }, placeText(use.last)),
      ),
    );
  }
  table.append(body);
  return el('div', { class: 'log-wrap', tabindex: '0', 'aria-label': 'Vehicles recorded with this plate' }, table);
}

export function renderPlateFile(
  main: HTMLElement,
  plate: string,
  state: string | null,
  isCurrent: () => boolean,
): void {
  const header = caseHeader('Plate file', plate + (state ? ' · ' + state : ' · all states'), 'Plate ' + plate);
  const vehicles = createPanel({ id: 'plate-vehicles', title: 'Vehicles that carried this plate', hint: 'Each VIN opens its full file. A plate moving between VINs usually means re-plating or a fleet transfer.', lines: 3 });
  const where = createPanel({ id: 'plate-where', title: 'Where it has been seen', lines: 3 });
  const carriers = createPanel({ id: 'plate-carriers', title: 'Carriers on these stops', lines: 2 });
  const log = createPanel({ id: 'plate-log', title: 'Roadside log', lines: 4 });
  const crashes = createPanel({ id: 'plate-crashes', title: 'FMCSA crash records', hint: 'Reported involvement matched by plate and, when supplied, issuing state. A listed vehicle is not a finding of fault.', lines: 3 });
  const ledger = createLedger();
  ledger.add('fmcsa', 'Roadside inspections · FMCSA');
  ledger.add('crashes', 'Crash records · FMCSA');

  main.replaceChildren(
    caseLayout(header.root, [vehicles.root, where.root, carriers.root, log.root, crashes.root], [
      ledger.root,
      el(
        'section',
        { class: 'rail-block', 'aria-labelledby': 'plate-recalls-title' },
        el('h2', { class: 'rail-block__title', id: 'plate-recalls-title' }, 'Safety recalls'),
        externalLink('https://www.nhtsa.gov/recalls', 'Check recalls by plate or VIN'),
        el('p', { class: 'note' }, 'NHTSA reports open unrepaired recalls for supported vehicles; coverage varies by manufacturer and vehicle age.'),
      ),
      limitsNote(
        'Only plates recorded at commercial roadside inspections or in the FMCSA Crash File appear here. Inspection date ranges show recorded observations, not continuous use; overlapping VIN date spans do not prove simultaneous plate use. This is not a DMV registration lookup, and the last carrier seen is not proof of current registration or ownership.',
      ),
    ]),
  );

  void getPlateCrashHistory(plate, state)
    .catch((): SectionResult<PlateCrashHistory> => ({ status: 'unavailable', source: { name: 'FMCSA Crash File' }, note: 'The crash-file lookup failed.' }))
    .then((result) => {
      if (!isCurrent()) return;
      ledger.set('crashes', result.status, result.source, result.data ? formatNumber(result.data.events.length) + ' records' : undefined);
      crashes.fill(renderPlateCrashes(result, state));
    });

  void searchByPlate(plate, state)
    .catch((): SectionResult<PlateResult> => ({ status: 'unavailable', source: { name: 'FMCSA' }, note: 'The lookup failed.' }))
    .then((result) => {
      if (!isCurrent()) return;
      const sightings = result.data?.sightings ?? [];
      ledger.set('fmcsa', result.status, result.source, sightings.length > 0 ? formatNumber(sightings.length) + ' stops' : undefined);
      if (sightings.length === 0) {
        header.setBody(el('p', { class: 'case__note' }, result.note ?? 'No records.'));
        vehicles.fill(emptyNote(state ? 'Try the search again without the state — the issuing state is sometimes recorded differently.' : 'Check the plate characters (0 vs O, 1 vs I).'));
        where.drop();
        carriers.drop();
        log.drop();
        return;
      }
      const names = new Map(
        (result.data?.carriers ?? []).map((carrier) => [carrier.dotNumber, carrierName(carrier)] as const),
      );
      const uses = vehiclesOnPlate(sightings);
      const states = [...new Set(sightings.map((s) => s.plateState).filter(Boolean))];
      header.setTitle('Plate ' + plate + (states.length === 1 ? ' · ' + states[0] : ''));
      header.setBody(
        el(
          'p',
          { class: 'case__summary' },
          formatNumber(uses.length) + ' vehicle' + (uses.length === 1 ? '' : 's') + ' · ' +
            formatNumber(names.size) + ' carrier' + (names.size === 1 ? '' : 's') + ' · ' +
            formatNumber(sightings.length) + ' roadside stops',
        ),
      );
      const overlappingRanges = uses.some((use) => use.overlapsWith.length > 0);
      vehicles.fill(
        el(
          'div',
          {},
          el('p', { class: 'note' }, overlappingRanges
            ? 'Date spans overlap between VINs. A span runs from the first to last recorded stop and does not show continuous plate use or prove simultaneous use.'
            : 'Each date span runs from the first to last recorded stop for that VIN; gaps are unobserved.'),
          vehiclesTable(uses, names, ledger, isCurrent),
        ),
      );
      const latest = sightings[0];
      where.fill(
        el(
          'div',
          { class: 'where' },
          latest ? el('div', { class: 'where__lead' }, lastSeen(latest, 'Last roadside stop')) : null,
          el(
            'div',
            { class: 'where__grid' },
            renderStateMap(stateCounts(sightings)) ?? frequencyList('States', countPlaces(sightings, 'state')),
            frequencyChips('Inspection sites', countPlaces(sightings, 'site'), 8),
          ),
        ),
      );
      const cards = (result.data?.carriers ?? []).map((carrier) => {
        const stops = sightings.filter((s) => s.carrierDotNumber === carrier.dotNumber).length;
        return carrierCard(carrier, 'On ' + formatNumber(stops) + ' stop' + (stops === 1 ? '' : 's') + ' with this plate');
      });
      if (cards.length > 0) carriers.fill(el('div', { class: 'carrier-stack' }, ...cards));
      else carriers.drop();
      log.fill(sightingTable(sightings, ['date', 'place', 'vin', 'unit', 'carrier', 'oos', 'findings'], 'Roadside stops with this plate', names));
    });
}
