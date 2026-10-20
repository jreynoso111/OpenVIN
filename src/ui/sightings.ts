/**
 * Location evidence from roadside inspections: last sighting, states and
 * sites by frequency, and a generic sighting table. All historical — an
 * inspection site is where a unit was stopped, never a live position.
 */

import type { UnitSighting } from '../lib/types';
import { ageLabel, el, formatDate, formatNumber } from './dom';
import { dotPivot, platePivot, vinPivot } from './pivot';

export interface Placed {
  readonly date: string | null;
  readonly state: string | null;
  readonly site: string | null;
}

const STATE_NAMES: Readonly<Record<string, string>> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** Headline place: the site plus the full state name, or just the state when no site is named. */
export function headlinePlace(item: Placed): string {
  const stateName = item.state ? STATE_NAMES[item.state] ?? item.state : null;
  const site = siteOnly(item);
  if (site && stateName) return site + ', ' + stateName;
  return site ?? (stateName ? stateName + ' (site not named)' : 'Place not reported');
}

/** Site without a trailing copy of the state code ("LEXINGTON VA" → "LEXINGTON"). */
function siteOnly(item: Placed): string | null {
  if (!item.site || item.site === item.state) return null;
  const trimmed = item.state ? item.site.replace(new RegExp('[ ,]+' + item.state + '$'), '') : item.site;
  return trimmed || null;
}

export function placeText(item: Placed): string {
  const parts = [siteOnly(item), item.state].filter((part): part is string => Boolean(part));
  return parts.join(', ') || 'Place not reported';
}

/** The headline "last seen" block. */
export function lastSeen(item: Placed, caption: string): HTMLElement {
  const age = ageLabel(item.date);
  return el(
    'div',
    { class: 'last-seen' },
    el('p', { class: 'last-seen__caption' }, caption),
    el('p', { class: 'last-seen__place' }, headlinePlace(item)),
    el(
      'p',
      { class: 'last-seen__when' },
      item.date ? el('time', { datetime: item.date }, formatDate(item.date)) : 'Date not reported',
      age ? el('span', { class: 'last-seen__age' }, age) : null,
    ),
  );
}

export interface PlaceCount {
  readonly label: string;
  readonly count: number;
  readonly lastDate: string | null;
}

export function countPlaces(items: readonly Placed[], by: 'state' | 'site'): PlaceCount[] {
  const map = new Map<string, { label: string; count: number; lastDate: string | null }>();
  for (const item of items) {
    const label = by === 'state' ? item.state : item.site ? placeText(item) : null;
    if (!label) continue;
    const entry = map.get(label) ?? { label, count: 0, lastDate: null };
    entry.count += 1;
    if (item.date && (!entry.lastDate || item.date > entry.lastDate)) entry.lastDate = item.date;
    map.set(label, entry);
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
  );
}

/** Horizontal frequency bars as a list — readable without the bars. */
export function frequencyList(
  title: string,
  counts: readonly PlaceCount[],
  limit = 6,
): HTMLElement | null {
  if (counts.length === 0) return null;
  const max = Math.max(...counts.map((c) => c.count));
  const shown = counts.slice(0, limit);
  return el(
    'div',
    { class: 'freq' },
    el('h3', { class: 'freq__title' }, title),
    el(
      'ol',
      { class: 'freq__list' },
      ...shown.map((entry) =>
        el(
          'li',
          { class: 'freq__row', style: `--share:${Math.max(4, Math.round((entry.count / max) * 100))}%` },
          el('span', { class: 'freq__label' }, entry.label),
          el('span', { class: 'freq__count' }, formatNumber(entry.count)),
          el('span', { class: 'freq__date' }, entry.lastDate ? 'last ' + formatDate(entry.lastDate) : ''),
        ),
      ),
    ),
    counts.length > limit
      ? el('p', { class: 'freq__more' }, '+ ' + formatNumber(counts.length - limit) + ' more')
      : null,
  );
}

/** Compact wrapped chips ("I-80 WB, IL ×2") — the dense alternative to frequencyList. */
export function frequencyChips(
  title: string,
  counts: readonly PlaceCount[],
  limit = 8,
): HTMLElement | null {
  if (counts.length === 0) return null;
  const shown = counts.slice(0, limit);
  const rest = counts.slice(limit);
  return el(
    'div',
    { class: 'chips' },
    el('h3', { class: 'freq__title' }, title),
    el(
      'ul',
      { class: 'chips__list' },
      ...shown.map((entry) =>
        el(
          'li',
          { class: 'chip', title: entry.lastDate ? 'Last ' + formatDate(entry.lastDate) : undefined },
          el('span', { class: 'chip__label' }, entry.label),
          el('span', { class: 'chip__count' }, '×' + formatNumber(entry.count)),
        ),
      ),
      rest.length > 0 ? el('li', { class: 'chip chip--more' }, '+' + formatNumber(rest.length) + ' more') : null,
    ),
  );
}

type Column = 'date' | 'place' | 'vin' | 'plate' | 'unit' | 'carrier' | 'oos';

const HEAD: Readonly<Record<Column, string>> = {
  date: 'Date',
  place: 'Where',
  vin: 'VIN',
  plate: 'Plate',
  unit: 'Unit',
  carrier: 'Carrier',
  oos: 'Result',
};

function cell(sighting: UnitSighting, column: Column, carrierNames: ReadonlyMap<string, string>): Node | string {
  switch (column) {
    case 'date':
      return sighting.date ? el('time', { datetime: sighting.date }, formatDate(sighting.date)) : '—';
    case 'place':
      return placeText(sighting);
    case 'vin':
      return sighting.vin ? vinPivot(sighting.vin) : '—';
    case 'plate':
      return sighting.plate ? platePivot(sighting.plate, sighting.plateState) : '—';
    case 'unit':
      return [sighting.unitType, sighting.make, sighting.companyUnit ? '#' + sighting.companyUnit : null]
        .filter(Boolean)
        .join(' · ') || '—';
    case 'carrier':
      return sighting.carrierDotNumber
        ? dotPivot(sighting.carrierDotNumber, carrierNames.get(sighting.carrierDotNumber))
        : '—';
    case 'oos':
      return (sighting.vehicleOutOfService ?? 0) > 0
        ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Out of service')
        : el('span', { class: 'muted' }, 'Inspected');
  }
}

export function sightingTable(
  sightings: readonly UnitSighting[],
  columns: readonly Column[],
  caption: string,
  carrierNames: ReadonlyMap<string, string> = new Map(),
): HTMLElement {
  const table = el(
    'table',
    { class: 'log' },
    el('caption', { class: 'visually-hidden' }, caption),
    el('thead', {}, el('tr', {}, ...columns.map((c) => el('th', { scope: 'col' }, HEAD[c])))),
  );
  const body = el('tbody');
  for (const sighting of sightings) {
    body.append(
      el(
        'tr',
        {},
        ...columns.map((c) => el('td', { 'data-label': HEAD[c] }, cell(sighting, c, carrierNames))),
      ),
    );
  }
  table.append(body);
  return el('div', { class: 'log-wrap', tabindex: '0', 'aria-label': caption }, table);
}
