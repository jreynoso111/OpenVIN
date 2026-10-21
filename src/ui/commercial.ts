/**
 * VIN file — FMCSA-derived sections: where the unit has been seen, how it
 * connects to plates, carriers and coupled units, and the roadside log.
 */

import { isGenericPlate } from '../lib/analysis';
import type { PlateLink } from '../lib/report';
import type { CarrierProfile, CommercialInspection, UnitSighting } from '../lib/types';
import { unitTypeLabel } from '../lib/api/fmcsaShared';
import { el, formatDate, formatNumber } from './dom';
import { carrierBase, carrierCard, carrierName } from './carrier';
import { emptyNote, factList } from './panel';
import { dotPivot, platePivot, vinPivot } from './pivot';
import { countPlaces, frequencyChips, frequencyList, lastSeen, placeText } from './sightings';
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

/** Empty state that explains the limits of the public FMCSA file instead of implying "no history". */
export function noHistoryNote(subject: string): HTMLElement {
  return el(
    'div',
    { class: 'nohist' },
    el('p', { class: 'empty' }, 'No roadside inspection in the public FMCSA file records this ' + subject + '.'),
    el(
      'p',
      { class: 'nohist__why' },
      el('strong', {}, 'This does not mean the truck has no history. '),
      'The public file keeps only about the last three years of inspections and, in our checks, leaves out inspections of carriers that are now inactive. ',
      'A truck whose earlier operators closed, lost authority or were sold can show nothing here even when older inspections exist. ',
      'Commercial history services that keep their own archives may show more.',
    ),
  );
}

/* ---------- Where it has been seen ---------- */

export function renderWhereSeen(records: readonly CommercialInspection[]): HTMLElement {
  const latest = records[0];
  if (!latest) return noHistoryNote('VIN');

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
      frequencyChips('Inspection sites', countPlaces(records.map((r) => ({ date: r.date, state: r.state, site: r.location })), 'site'), 8),
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
  inspections: Array<{ id: string; date: string | null }>;
}

function companions(records: readonly CommercialInspection[]): Companion[] {
  const map = new Map<string, Companion>();
  for (const record of records) {
    for (const unit of record.companions) {
      const key = unit.vin ?? (unit.plate ?? '') + '|' + (unit.plateState ?? '');
      if (key === '|') continue;
      const entry = map.get(key) ?? { sighting: unit, count: 0, last: null, inspections: [] };
      if (!entry.inspections.some((inspection) => inspection.id === record.inspectionId)) {
        const date = record.date ?? unit.date;
        entry.inspections.push({ id: record.inspectionId, date });
        entry.count = entry.inspections.length;
        if (date && (!entry.last || date > entry.last)) entry.last = date;
      }
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, inspections: [...entry.inspections].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) }))
    .sort((a, b) => b.count - a.count || (b.last ?? '').localeCompare(a.last ?? ''));
}

function relation(kind: string, subject: Node, detail: Node | string, evidence: string): HTMLElement {
  return el(
    'li',
    { class: 'rel' },
    el('span', { class: 'rel__kind' }, kind),
    el('span', { class: 'rel__subject' }, subject),
    el('div', { class: 'rel__detail' }, detail),
    el('span', { class: 'rel__evidence' }, evidence),
  );
}

function relationGroup(title: string, description: string, rows: readonly HTMLElement[]): HTMLElement | null {
  if (rows.length === 0) return null;
  return el(
    'section',
    { class: 'rel-group' },
    el('h3', { class: 'rel-group__title' }, title),
    el('p', { class: 'rel-group__hint' }, description),
    el('ul', { class: 'rels' }, ...rows),
  );
}

export function renderConnections(
  records: readonly CommercialInspection[],
  plateLinks: readonly PlateLink[],
  searchedVin: string,
): HTMLElement {
  const plateRows: HTMLElement[] = [];
  const carrierRows: HTMLElement[] = [];
  const companionRows: HTMLElement[] = [];

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
    const otherSightings = (shared?.sightings ?? []).filter((sighting) => sighting.vin && sighting.vin !== searchedVin);
    const otherVins = [...new Set(otherSightings.map((sighting) => sighting.vin as string))];
    const sightingsByVin = new Map<string, UnitSighting[]>();
    for (const sighting of otherSightings) {
      const sightings = sightingsByVin.get(sighting.vin!) ?? [];
      sightings.push(sighting);
      sightingsByVin.set(sighting.vin!, sightings);
    }
    const detail = isGenericPlate(entry.plate)
      ? 'Temporary or paper plate; a shared plate like this is a weak vehicle match.'
      : otherVins.length > 0
        ? el(
            'div',
            {},
            'The same plate appears under other VINs. Compare the inspection IDs below with this VIN’s roadside log to see whether any sighting belongs to the same stop.',
            el(
              'ul',
              { class: 'rel__sightings' },
              ...otherVins.slice(0, 5).map((vin) => {
                const dates = [...new Set((sightingsByVin.get(vin) ?? []).map((sighting) => sighting.date).filter((date): date is string => Boolean(date)))];
                return el(
                  'li',
                  {},
                  vinPivot(vin),
                  ' · other plate record',
                  ': ',
                  ...(sightingsByVin.get(vin) ?? []).slice(0, 5).map((sighting, index) =>
                    el(
                      'span',
                      { class: 'rel__sighting-id' },
                      index > 0 ? ' · ' : '',
                      sighting.date ? formatDate(sighting.date) : dates.length > 0 ? dates.map(formatDate).join(', ') : 'Date not reported',
                      ' · FMCSA #',
                      sighting.inspectionId,
                    ),
                  ),
                );
              }),
              otherVins.length > 5 ? el('li', {}, 'and ' + (otherVins.length - 5) + ' more VINs') : null,
            ),
          )
        : 'No other VIN was found under this plate in the current FMCSA file.';
    plateRows.push(
      relation(
        'Plate record',
        platePivot(entry.plate, entry.state),
        detail,
        'Searched VIN: ' + formatNumber(entry.count) + '× · ' + span(entry.first, entry.last),
      ),
    );
  }

  for (const use of carrierUses(records)) {
    carrierRows.push(
      relation(
        'Carrier on record',
        dotPivot(use.carrier.dotNumber, carrierName(use.carrier)),
        [
          [carrierBase(use.carrier), use.carrier.dbaName ? 'DBA ' + use.carrier.dbaName : null].filter(Boolean).join(' · ') || 'USDOT ' + use.carrier.dotNumber,
          'Listed on this VIN’s FMCSA inspection records.',
        ].join(' · '),
        formatNumber(use.count) + '× · ' + span(use.first, use.last),
      ),
    );
  }

  for (const companion of companions(records).slice(0, 8)) {
    const unit = companion.sighting;
    const unitDetails = [unit.unitType, unit.make, unit.companyUnit ? '#' + unit.companyUnit : null]
      .filter(Boolean)
      .join(' · ');
    const inspectionList = el(
      'details',
      { class: 'rel__proof' },
      el('summary', {}, 'Show matching FMCSA inspections (' + formatNumber(companion.count) + ')'),
      el(
        'ul',
        { class: 'rel__sightings' },
        ...companion.inspections.map((inspection) =>
          el(
            'li',
            {},
            inspection.date ? formatDate(inspection.date) : 'Date not reported',
            ' · FMCSA inspection #',
            inspection.id,
          ),
        ),
      ),
    );
    companionRows.push(
      relation(
        'Same inspection',
        unit.vin ? vinPivot(unit.vin) : el('span', { class: 'muted' }, 'VIN not recorded'),
        el(
          'div',
          {},
          unitDetails || 'Other inspected unit',
          unit.plate ? el('div', { class: 'rel__unit-plate' }, 'Plate ', platePivot(unit.plate, unit.plateState)) : null,
          el('p', { class: 'rel__explanation' }, 'FMCSA listed this unit in the same roadside inspection as VIN ' + searchedVin + '.'),
          inspectionList,
        ),
        formatNumber(companion.count) + ' shared inspection' + (companion.count === 1 ? '' : 's') + ' · latest ' + (companion.last ? formatDate(companion.last) : '—'),
      ),
    );
  }

  if (plateRows.length + carrierRows.length + companionRows.length === 0) {
    return emptyNote('No plates, carriers or other units are linked to this VIN yet.');
  }
  return el(
    'div',
    { class: 'rel-groups' },
    relationGroup('Same plate', 'A shared plate alone does not establish a shared inspection. Compare the FMCSA inspection IDs with the roadside log.', plateRows),
    relationGroup('Carrier on this VIN’s record', 'These carriers appear on the searched VIN’s own FMCSA inspection records.', carrierRows),
    relationGroup('Other units in the same inspection', 'These VINs were listed alongside the searched VIN under the FMCSA inspection IDs shown below.', companionRows),
  );
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
  const resultKnown = record.vehicleViolations !== null && record.vehicleOutOfService !== null;
  const summary = el(
    'span',
    {},
    oos
      ? el(
          'span',
          { class: 'tag', 'data-tone': 'danger', title: 'FMCSA recorded the vehicle as out of service during this inspection.' },
          "Didn't pass",
        )
      : !resultKnown
        ? el('span', { class: 'muted' }, 'Unit result unavailable')
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

function unitTypeConflict(fmcsatype: string | null, decodedType: string | null): boolean {
  if (!fmcsatype || !decodedType) return false;
  const fmcsa = fmcsatype.toUpperCase();
  const decoded = decodedType.toUpperCase();
  return (decoded.includes('TRAILER') && (fmcsa.includes('TRUCK TRACTOR') || fmcsa.includes('STRAIGHT TRUCK'))) ||
    ((decoded.includes('TRUCK') || decoded.includes('TRACTOR')) && fmcsa.includes('SEMI-TRAILER'));
}

export function renderRoadsideLog(
  records: readonly CommercialInspection[],
  searchedVin: string,
  decodedType: string | null = null,
): HTMLElement {
  const table = el(
    'table',
    { class: 'log' },
    el('caption', { class: 'visually-hidden' }, 'FMCSA roadside inspections matched to VIN ' + searchedVin),
    el(
      'thead',
      {},
      el('tr', {}, ...['Exact VIN match', 'FMCSA class', 'Date', 'Where', 'Plate', 'Carrier', 'Other units in the same inspection', 'Result for this VIN'].map((h) => el('th', { scope: 'col' }, h))),
    ),
  );
  const body = el('tbody');
  for (const record of records) {
    const carrier = carrierFromRecord(record);
    const fmcsaType = unitTypeLabel(record.vehicleTypeCode);
    const typeConflict = unitTypeConflict(fmcsaType, decodedType);
    body.append(
      el(
        'tr',
        {},
        el('td', { 'data-label': 'Exact VIN match' }, el('code', { class: 'log__vin' }, searchedVin), el('span', { class: 'sub' }, 'VIN matched in FMCSA unit file')),
        el(
          'td',
          { 'data-label': 'FMCSA class' },
          fmcsaType ?? el('span', { class: 'muted' }, 'Not reported'),
          typeConflict ? el('span', { class: 'tag log__type-warning', 'data-tone': 'warn' }, 'Check: VIN decode says ' + decodedType) : null,
        ),
        el('td', { 'data-label': 'Date' }, record.date ? el('time', { datetime: record.date }, formatDate(record.date)) : '—', el('span', { class: 'sub' }, 'Insp. ' + record.inspectionId)),
        el('td', { 'data-label': 'Where' }, placeText({ date: record.date, state: record.state, site: record.location }), record.level ? el('span', { class: 'sub' }, 'Level ' + record.level) : null),
        el('td', { 'data-label': 'Plate' }, record.plate ? platePivot(record.plate, record.plateState) : '—', record.companyUnit ? el('span', { class: 'sub' }, 'Unit #' + record.companyUnit) : null),
        el('td', { 'data-label': 'Carrier' }, carrier ? dotPivot(carrier.dotNumber, carrier.legalName ?? carrier.dbaName ?? undefined) : '—'),
        el(
          'td',
          { 'data-label': 'Other units in the same inspection' },
          record.companions.length === 0
            ? el('span', { class: 'muted' }, '—')
            : el(
                'span',
                { class: 'stack' },
                ...record.companions.map((c) =>
                  el(
                    'span',
                    { class: 'log__companion' },
                    c.vin ? vinPivot(c.vin) : c.plate ? platePivot(c.plate, c.plateState) : el('span', { class: 'muted' }, 'VIN not recorded'),
                    el(
                      'span',
                      { class: 'sub' },
                      [c.unitType, c.position !== null ? 'FMCSA unit ' + c.position : null].filter(Boolean).join(' · ') || 'Listed in inspection #' + record.inspectionId,
                    ),
                  ),
                ),
              ),
        ),
        el('td', { 'data-label': 'Result for this VIN' }, findings(record)),
      ),
    );
  }
  table.append(body);
  return el('div', { class: 'log-wrap', tabindex: '0', 'aria-label': 'FMCSA roadside inspections matched to VIN ' + searchedVin }, table);
}
