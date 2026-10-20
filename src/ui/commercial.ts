/**
 * VIN file — FMCSA-derived sections: where the unit has been seen, how it
 * connects to plates, carriers and coupled units, and the roadside log.
 */

import { isGenericPlate } from '../lib/analysis';
import type { PlateLink } from '../lib/report';
import type { CarrierProfile, CommercialInspection, UnitSighting } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { carrierBase, carrierCard, carrierName } from './carrier';
import { emptyNote, factList } from './panel';
import { dotPivot, platePivot, vinPivot } from './pivot';
import { countPlaces, frequencyList, lastSeen, placeText } from './sightings';
import { renderStateMap, stateCounts } from './stateMap';

/** Rebuild the census profile flattened onto an inspection record. */
export function carrierFromRecord(record: CommercialInspection): CarrierProfile | null {
  if (!record.carrierDotNumber) return null;
  return {
    dotNumber: record.carrierDotNumber,
    legalName: record.carrierLegalName,
    dbaName: record.carrierDbaName,
    isBusiness: Boolean(record.carrierLegalName ?? record.carrierDbaName),
    status: record.carrierStatusCode,
    operationClass: record.carrierOperationClass,
    truckUnits: record.carrierTruckUnits,
    powerUnits: record.carrierPowerUnits,
    drivers: null,
    recordableCrashRate: record.carrierRecordableCrashRate,
    mcs150Date: record.carrierMcs150Date,
    addedDate: null,
    docketPrefix: record.carrierDocketPrefix,
    docketNumber: record.carrierDocketNumber,
    authorityStatus: record.carrierAuthorityStatusCode,
    safetyRating: record.carrierSafetyRating,
    safetyRatingDate: record.carrierSafetyRatingDate,
    baseCity: record.carrierBaseCity,
    baseState: record.carrierBaseState,
  };
}

interface CarrierUse {
  carrier: CarrierProfile;
  count: number;
  first: string | null;
  last: string | null;
}

/** Carriers on this VIN's inspections, most recent first. */
export function carrierUses(records: readonly CommercialInspection[]): CarrierUse[] {
  const map = new Map<string, CarrierUse>();
  for (const record of records) {
    const carrier = carrierFromRecord(record);
    if (!carrier) continue;
    const use = map.get(carrier.dotNumber) ?? { carrier, count: 0, first: null, last: null };
    use.count += 1;
    if (record.date) {
      if (!use.last || record.date > use.last) use.last = record.date;
      if (!use.first || record.date < use.first) use.first = record.date;
    }
    map.set(carrier.dotNumber, use);
  }
  return [...map.values()].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''));
}

function span(first: string | null, last: string | null): string {
  if (!last) return 'dates not reported';
  if (!first || first === last) return formatDate(last);
  return formatDate(first) + ' – ' + formatDate(last);
}

/* ---------- Where it has been seen ---------- */

export function renderWhereSeen(records: readonly CommercialInspection[]): HTMLElement {
  const latest = records[0];
  if (!latest) return emptyNote('No roadside inspection has recorded this VIN in the current FMCSA files (about three years).');

  const uses = carrierUses(records);
  const bases = uses
    .map((use) => ({ base: carrierBase(use.carrier), name: carrierName(use.carrier), dot: use.carrier.dotNumber }))
    .filter((entry): entry is { base: string; name: string; dot: string } => entry.base !== null);
  const markings = [...new Set(records.map((r) => r.companyUnit).filter((u): u is string => Boolean(u)))];

  return el(
    'div',
    { class: 'where' },
    el(
      'div',
      { class: 'where__lead' },
      lastSeen({ date: latest.date, state: latest.state, site: latest.location }, 'Last roadside stop'),
      factList(
        [
          ['Plate at that stop', latest.plate ? platePivot(latest.plate, latest.plateState) : null],
          ['Operating carrier', latest.carrierDotNumber ? dotPivot(latest.carrierDotNumber, carrierFromRecord(latest)?.legalName ?? undefined) : null],
          [
            'Carrier base',
            bases[0] ? bases[0].base : null,
          ],
          ['Fleet marking', markings.length > 0 ? markings.slice(0, 4).join(' · ') : null],
        ],
        'facts facts--tight',
      ),
    ),
    el(
      'div',
      { class: 'where__grid' },
      renderStateMap(stateCounts(records)) ??
        frequencyList('States', countPlaces(records.map((r) => ({ date: r.date, state: r.state, site: r.location })), 'state')),
      frequencyList('Inspection sites', countPlaces(records.map((r) => ({ date: r.date, state: r.state, site: r.location })), 'site'), 5),
    ),
    bases.length > 1
      ? el(
          'p',
          { class: 'where__bases' },
          'Other carrier bases: ',
          ...bases.slice(1).flatMap((b, i) => [i > 0 ? ' · ' : '', b.base + ' (' + b.name + ')']),
        )
      : null,
  );
}

/* ---------- Connections ---------- */

interface Companion {
  sighting: UnitSighting;
  count: number;
  last: string | null;
}

function companions(records: readonly CommercialInspection[]): Companion[] {
  const map = new Map<string, Companion>();
  for (const record of records) {
    for (const unit of record.companions) {
      const key = unit.vin ?? (unit.plate ?? '') + '|' + (unit.plateState ?? '');
      if (key === '|') continue;
      const entry = map.get(key) ?? { sighting: unit, count: 0, last: null };
      entry.count += 1;
      if (unit.date && (!entry.last || unit.date > entry.last)) entry.last = unit.date;
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || (b.last ?? '').localeCompare(a.last ?? ''));
}

function relation(kind: string, subject: Node, detail: Node | string, evidence: string): HTMLElement {
  return el(
    'li',
    { class: 'rel' },
    el('span', { class: 'rel__kind' }, kind),
    el('span', { class: 'rel__subject' }, subject),
    el('span', { class: 'rel__detail' }, detail),
    el('span', { class: 'rel__evidence' }, evidence),
  );
}

export function renderConnections(
  records: readonly CommercialInspection[],
  plateLinks: readonly PlateLink[],
): HTMLElement {
  const rows: HTMLElement[] = [];

  const plates = new Map<string, { plate: string; state: string | null; count: number; first: string | null; last: string | null }>();
  for (const record of records) {
    if (!record.plate) continue;
    const key = record.plate + '|' + (record.plateState ?? '');
    const entry = plates.get(key) ?? { plate: record.plate, state: record.plateState, count: 0, first: null, last: null };
    entry.count += 1;
    if (record.date) {
      if (!entry.last || record.date > entry.last) entry.last = record.date;
      if (!entry.first || record.date < entry.first) entry.first = record.date;
    }
    plates.set(key, entry);
  }
  for (const entry of [...plates.values()].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))) {
    const shared = plateLinks.find((link) => link.plate === entry.plate && link.state === entry.state);
    const otherVins = [...new Set((shared?.sightings ?? []).map((s) => s.vin).filter((v): v is string => Boolean(v)))];
    rows.push(
      relation(
        'Plate',
        platePivot(entry.plate, entry.state),
        isGenericPlate(entry.plate)
          ? 'Temporary or paper plate — shared by many vehicles'
          : otherVins.length > 0
          ? el('span', {}, 'Also recorded on ', ...otherVins.slice(0, 3).flatMap((v, i) => [i > 0 ? ', ' : '', vinPivot(v)]), otherVins.length > 3 ? ' +' + (otherVins.length - 3) : '')
          : 'Only this VIN in FMCSA files',
        formatNumber(entry.count) + '× · ' + span(entry.first, entry.last),
      ),
    );
  }

  for (const use of carrierUses(records)) {
    rows.push(
      relation(
        'Carrier',
        dotPivot(use.carrier.dotNumber, carrierName(use.carrier)),
        [carrierBase(use.carrier), use.carrier.dbaName ? 'DBA ' + use.carrier.dbaName : null].filter(Boolean).join(' · ') || 'USDOT ' + use.carrier.dotNumber,
        formatNumber(use.count) + '× · ' + span(use.first, use.last),
      ),
    );
  }

  for (const companion of companions(records).slice(0, 8)) {
    const unit = companion.sighting;
    rows.push(
      relation(
        unit.unitType ?? 'Coupled unit',
        unit.vin ? vinPivot(unit.vin) : el('span', { class: 'muted' }, 'VIN not recorded'),
        el(
          'span',
          {},
          unit.plate ? platePivot(unit.plate, unit.plateState) : null,
          [unit.make, unit.companyUnit ? '#' + unit.companyUnit : null].filter(Boolean).length > 0
            ? ' ' + [unit.make, unit.companyUnit ? '#' + unit.companyUnit : null].filter(Boolean).join(' · ')
            : null,
        ),
        'together ' + formatNumber(companion.count) + '× · last ' + (companion.last ? formatDate(companion.last) : '—'),
      ),
    );
  }

  if (rows.length === 0) return emptyNote('No plates, carriers or coupled units are linked to this VIN yet.');
  return el('ul', { class: 'rels' }, ...rows);
}

/* ---------- Carriers ---------- */

export function renderCarriers(records: readonly CommercialInspection[]): HTMLElement | null {
  const uses = carrierUses(records);
  if (uses.length === 0) return null;
  return el(
    'div',
    { class: 'carrier-stack' },
    ...uses.map((use) =>
      carrierCard(use.carrier, 'On ' + formatNumber(use.count) + ' inspection' + (use.count === 1 ? '' : 's') + ' of this VIN · ' + span(use.first, use.last)),
    ),
  );
}

/* ---------- Roadside log ---------- */

function findings(record: CommercialInspection): Node {
  const oos = (record.vehicleOutOfService ?? 0) > 0;
  const count = record.vehicleViolations ?? 0;
  const summary = el(
    'span',
    {},
    oos
      ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Out of service')
      : el('span', { class: count > 0 ? '' : 'muted' }, count > 0 ? formatNumber(count) + ' vehicle violation' + (count === 1 ? '' : 's') : 'Clean'),
  );
  if (record.vehicleFindings.length === 0) return summary;
  const details = el('details', { class: 'findings' }, el('summary', {}, summary));
  details.append(
    el(
      'ul',
      {},
      ...record.vehicleFindings.map((finding) =>
        el(
          'li',
          { 'data-oos': finding.outOfService ? 'true' : 'false' },
          [finding.code, finding.description].filter(Boolean).join(' — ') || 'Vehicle finding',
        ),
      ),
    ),
  );
  return details;
}

export function renderRoadsideLog(records: readonly CommercialInspection[]): HTMLElement {
  const table = el(
    'table',
    { class: 'log' },
    el('caption', { class: 'visually-hidden' }, 'Roadside inspections of this VIN'),
    el(
      'thead',
      {},
      el('tr', {}, ...['Date', 'Where', 'Plate', 'Carrier', 'Coupled with', 'Vehicle result'].map((h) => el('th', { scope: 'col' }, h))),
    ),
  );
  const body = el('tbody');
  for (const record of records) {
    const carrier = carrierFromRecord(record);
    body.append(
      el(
        'tr',
        {},
        el('td', { 'data-label': 'Date' }, record.date ? el('time', { datetime: record.date }, formatDate(record.date)) : '—', el('span', { class: 'sub' }, 'Insp. ' + record.inspectionId)),
        el('td', { 'data-label': 'Where' }, placeText({ date: record.date, state: record.state, site: record.location }), record.level ? el('span', { class: 'sub' }, 'Level ' + record.level) : null),
        el('td', { 'data-label': 'Plate' }, record.plate ? platePivot(record.plate, record.plateState) : '—', record.companyUnit ? el('span', { class: 'sub' }, 'Unit #' + record.companyUnit) : null),
        el('td', { 'data-label': 'Carrier' }, carrier ? dotPivot(carrier.dotNumber, carrier.legalName ?? carrier.dbaName ?? undefined) : '—'),
        el(
          'td',
          { 'data-label': 'Coupled with' },
          record.companions.length === 0
            ? el('span', { class: 'muted' }, '—')
            : el('span', { class: 'stack' }, ...record.companions.map((c) => (c.vin ? vinPivot(c.vin) : c.plate ? platePivot(c.plate, c.plateState) : el('span', { class: 'muted' }, c.unitType ?? 'Unit')))),
        ),
        el('td', { 'data-label': 'Vehicle result' }, findings(record)),
      ),
    );
  }
  table.append(body);
  return el('div', { class: 'log-wrap', tabindex: '0', 'aria-label': 'Roadside inspections of this VIN' }, table);
}
