/**
 * U.S. tile-grid map: one square per state, shaded by how often a unit was
 * stopped there. A tile grid needs no geometry data and keeps small states
 * as legible as large ones. Counts are always printed on the tile and in its
 * title, so the shading is never the only signal.
 */

import { el, formatDate, formatNumber } from './dom';

const LAYOUT: readonly string[] = [
  'AK . . . . . . . . . . ME',
  '. . . . . . . . . . VT NH',
  'WA ID MT ND MN IL WI MI NY RI MA CT',
  'OR NV WY SD IA IN OH PA NJ . . .',
  'CA UT CO NE MO KY WV VA MD DE . .',
  '. AZ NM KS AR TN NC SC DC . . .',
  '. . . OK LA MS AL GA . . . .',
  'HI . . TX . . . . FL . . .',
];

export interface StateCount {
  readonly state: string;
  readonly count: number;
  readonly lastDate: string | null;
}

/** Count items per state code; codes outside the grid (Canada, Mexico, PR) are kept. */
export function stateCounts(
  items: ReadonlyArray<{ state: string | null; date: string | null }>,
): StateCount[] {
  const map = new Map<string, { count: number; lastDate: string | null }>();
  for (const item of items) {
    if (!item.state) continue;
    const entry = map.get(item.state) ?? { count: 0, lastDate: null };
    entry.count += 1;
    if (item.date && (!entry.lastDate || item.date > entry.lastDate)) entry.lastDate = item.date;
    map.set(item.state, entry);
  }
  return [...map.entries()].map(([state, value]) => ({ state, ...value }));
}

export function renderStateMap(counts: readonly StateCount[], noun = 'inspection'): HTMLElement | null {
  if (counts.length === 0) return null;
  const byState = new Map(counts.map((c) => [c.state, c]));
  const max = Math.max(...counts.map((c) => c.count));
  const inGrid = new Set<string>();

  const grid = el('div', { class: 'usmap__grid', role: 'img', 'aria-label': 'Map of states where inspections were recorded' });
  for (const row of LAYOUT) {
    for (const code of row.split(' ')) {
      if (code === '.') {
        grid.append(el('span', { class: 'usmap__gap', 'aria-hidden': 'true' }));
        continue;
      }
      inGrid.add(code);
      const entry = byState.get(code);
      const level = entry ? Math.max(1, Math.ceil((entry.count / max) * 4)) : 0;
      grid.append(
        el(
          'span',
          {
            class: 'usmap__tile',
            'data-level': String(level),
            title: entry
              ? code + ': ' + formatNumber(entry.count) + ' ' + noun + (entry.count === 1 ? '' : 's') + (entry.lastDate ? ', last ' + formatDate(entry.lastDate) : '')
              : code + ': none',
          },
          el('span', { class: 'usmap__code' }, code),
          entry ? el('span', { class: 'usmap__n' }, formatNumber(entry.count)) : null,
        ),
      );
    }
  }

  const outside = counts.filter((c) => !inGrid.has(c.state)).sort((a, b) => b.count - a.count);
  return el(
    'figure',
    { class: 'usmap' },
    grid,
    outside.length > 0
      ? el(
          'figcaption',
          { class: 'usmap__outside' },
          'Outside the 50 states: ',
          outside.map((c) => c.state + ' ' + formatNumber(c.count)).join(' · '),
        )
      : null,
  );
}
