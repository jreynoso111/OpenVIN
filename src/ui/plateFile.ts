/**
 * Plate file: every vehicle that carried a plate in FMCSA roadside records,
 * the carriers behind it, and where the plate was stopped.
 */

import { searchByPlate, type PlateResult } from '../lib/api/fmcsaLookup';
import type { SectionResult, UnitSighting } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { caseHeader, caseLayout, limitsNote } from './case';
import { carrierCard, carrierName } from './carrier';
import { createLedger, createPanel, emptyNote } from './panel';
import { dotPivot, vinPivot } from './pivot';
import { countPlaces, frequencyList, lastSeen, placeText, sightingTable } from './sightings';

interface VehicleUse {
  vin: string;
  make: string | null;
  unitType: string | null;
  count: number;
  first: string | null;
  last: UnitSighting;
  carriers: Set<string>;
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
    };
    use.count += 1;
    if (sighting.date && (!use.last.date || sighting.date > use.last.date)) use.last = sighting;
    if (sighting.date && (!use.first || sighting.date < use.first)) use.first = sighting.date;
    if (sighting.carrierDotNumber) use.carriers.add(sighting.carrierDotNumber);
    map.set(sighting.vin, use);
  }
  return [...map.values()].sort((a, b) => (b.last.date ?? '').localeCompare(a.last.date ?? ''));
}

function vehiclesTable(uses: readonly VehicleUse[], names: ReadonlyMap<string, string>): HTMLElement {
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
        el('td', { 'data-label': 'VIN' }, vinPivot(use.vin)),
        el('td', { 'data-label': 'Unit' }, [use.unitType, use.make].filter(Boolean).join(' · ') || '—'),
        el('td', { 'data-label': 'Carrier' }, el('span', { class: 'stack' }, ...[...use.carriers].map((dot) => dotPivot(dot, names.get(dot))))),
        el('td', { 'data-label': 'Seen' }, formatNumber(use.count) + '×', el('span', { class: 'sub' }, (use.first ? formatDate(use.first) : '—') + ' – ' + (use.last.date ? formatDate(use.last.date) : '—'))),
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
  const ledger = createLedger();
  ledger.add('fmcsa', 'Roadside inspections · FMCSA');

  main.replaceChildren(
    caseLayout(header.root, [vehicles.root, where.root, carriers.root, log.root], [
      ledger.root,
      limitsNote(
        'Only plates recorded at commercial roadside inspections appear here. This is not a DMV registration lookup, and the last carrier seen is not proof of current registration or ownership.',
      ),
    ]),
  );

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
      vehicles.fill(vehiclesTable(uses, names));
      const latest = sightings[0];
      where.fill(
        el(
          'div',
          { class: 'where' },
          latest ? el('div', { class: 'where__lead' }, lastSeen(latest, 'Last roadside stop')) : null,
          el(
            'div',
            { class: 'where__grid' },
            frequencyList('States', countPlaces(sightings, 'state')),
            frequencyList('Inspection sites', countPlaces(sightings, 'site'), 5),
          ),
        ),
      );
      const cards = (result.data?.carriers ?? []).map((carrier) => {
        const stops = sightings.filter((s) => s.carrierDotNumber === carrier.dotNumber).length;
        return carrierCard(carrier, 'On ' + formatNumber(stops) + ' stop' + (stops === 1 ? '' : 's') + ' with this plate');
      });
      if (cards.length > 0) carriers.fill(el('div', { class: 'carrier-stack' }, ...cards));
      else carriers.drop();
      log.fill(sightingTable(sightings, ['date', 'place', 'vin', 'unit', 'carrier', 'oos'], 'Roadside stops with this plate', names));
    });
}
