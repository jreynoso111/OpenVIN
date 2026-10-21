/** Section 6 — odometer history: inline SVG chart, rollback check, table. */

import type { GuidedLink, NyInspectionDetail, OdometerReading, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber, svgEl } from './dom';
import { guidedLinkRow } from './links';
import { factList } from './panel';

const VIEW_W = 480;
const VIEW_H = 220;
// Room above the line for the value labels and the mi/yr note, so they never overlap.
const PAD = { top: 42, right: 24, bottom: 32, left: 24 } as const;
const MAX_VALUE_LABELS = 6;
const MAX_DATE_LABELS = 4;

interface Point {
  readonly x: number;
  readonly y: number;
  readonly reading: OdometerReading;
}

/** Chronological copy for the detailed inspection history. */
export function sortReadings(readings: readonly OdometerReading[]): OdometerReading[] {
  return [...readings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function computePoints(readings: readonly OdometerReading[]): Point[] {
  const times = readings.map((reading) => new Date(reading.date).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;
  const miles = readings.map((reading) => reading.miles);
  const minMiles = Math.min(...miles);
  const maxMiles = Math.max(...miles);
  const milesSpan = maxMiles - minMiles || Math.max(maxMiles * 0.1, 1);

  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = VIEW_H - PAD.top - PAD.bottom;

  return readings.map((reading, index) => {
    const time = times[index] ?? minTime;
    const x =
      readings.length === 1
        ? PAD.left + innerW / 2
        : PAD.left + ((time - minTime) / timeSpan) * innerW;
    const y = PAD.top + innerH - ((reading.miles - minMiles) / milesSpan) * innerH;
    return { x, y, reading };
  });
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Average accumulation rate across sorted readings; null when not estimable. */
function averageMilesPerYear(
  readings: readonly OdometerReading[],
): number | null {
  if (readings.length < 2) return null;
  const first = readings[0];
  const last = readings[readings.length - 1];
  if (!first || !last) return null;
  const spanMs = new Date(last.date).getTime() - new Date(first.date).getTime();
  const deltaMiles = last.miles - first.miles;
  if (!Number.isFinite(spanMs) || spanMs <= 0 || deltaMiles <= 0) return null;
  return Math.round(deltaMiles / (spanMs / MS_PER_YEAR));
}

function pickIndexes(count: number, max: number): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i));
  const picked = new Set<number>();
  for (let i = 0; i < max; i += 1) {
    picked.add(Math.round((i / (max - 1)) * (count - 1)));
  }
  return picked;
}

function buildChart(points: readonly Point[]): SVGElement {
  const first = points[0];
  const last = points[points.length - 1];
  const chart = svgEl('svg', {
    class: 'odo-chart',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    role: 'img',
    'aria-label':
      first && last
        ? `Odometer readings from ${formatNumber(first.reading.miles)} miles on ` +
          `${formatDate(first.reading.date)} to ${formatNumber(last.reading.miles)} ` +
          `miles on ${formatDate(last.reading.date)}. Full data in the table below.`
        : 'Odometer readings chart',
  });

  const baselineY = VIEW_H - PAD.bottom + 6;
  chart.append(
    svgEl('line', {
      class: 'baseline',
      x1: PAD.left - 12,
      y1: baselineY,
      x2: VIEW_W - PAD.right + 12,
      y2: baselineY,
    }),
  );

  // Light horizontal gridlines at quarter heights of the plot area.
  const innerH = VIEW_H - PAD.top - PAD.bottom;
  for (const fraction of [0.25, 0.5, 0.75]) {
    chart.append(
      svgEl('line', {
        class: 'gridline',
        x1: PAD.left - 12,
        y1: (PAD.top + innerH * fraction).toFixed(1),
        x2: VIEW_W - PAD.right + 12,
        y2: (PAD.top + innerH * fraction).toFixed(1),
      }),
    );
  }

  const perYear = averageMilesPerYear(points.map((point) => point.reading));
  if (perYear !== null) {
    chart.append(
      svgEl(
        'text',
        {
          class: 'annotation',
          x: VIEW_W - PAD.right + 12,
          y: 14,
          'text-anchor': 'end',
        },
        `≈ ${formatNumber(perYear)} mi/yr`,
      ),
    );
  }

  if (points.length > 1) {
    const lineD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const areaD =
      `${lineD} L${points[points.length - 1]?.x.toFixed(1)} ${baselineY}` +
      ` L${points[0]?.x.toFixed(1)} ${baselineY} Z`;
    chart.append(svgEl('path', { class: 'area', d: areaD }));
    chart.append(svgEl('path', { class: 'line', d: lineD }));
  }

  const valueLabels = pickIndexes(points.length, MAX_VALUE_LABELS);
  const dateLabels = pickIndexes(points.length, MAX_DATE_LABELS);

  points.forEach((point, index) => {
    chart.append(
      svgEl('circle', { class: 'dot', cx: point.x, cy: point.y, r: 4.5 }),
    );
    if (valueLabels.has(index)) {
      const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
      chart.append(
        svgEl(
          'text',
          {
            class: 'value-label',
            x: point.x,
            y: point.y - 12,
            'text-anchor': anchor,
          },
          formatNumber(point.reading.miles),
        ),
      );
    }
    if (dateLabels.has(index)) {
      const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
      chart.append(
        svgEl(
          'text',
          {
            class: 'date-label',
            x: point.x,
            y: baselineY + 16,
            'text-anchor': anchor,
          },
          formatDate(point.reading.date),
        ),
      );
    }
  });

  return chart;
}

function findRollbacks(
  readings: readonly OdometerReading[],
): { readonly prev: OdometerReading; readonly next: OdometerReading }[] {
  const drops: { prev: OdometerReading; next: OdometerReading }[] = [];
  for (let i = 1; i < readings.length; i += 1) {
    const prev = readings[i - 1];
    const next = readings[i];
    if (prev && next && next.miles < prev.miles) drops.push({ prev, next });
  }
  return drops;
}

/** True when any later reading is lower than an earlier one (sorted input). */
export function hasRollback(readings: readonly OdometerReading[]): boolean {
  return findRollbacks(readings).length > 0;
}

/** Standalone chart for reuse (overview panel). ViewBox-based — safe hidden. */
export function buildOdometerChart(
  readings: readonly OdometerReading[],
): SVGElement {
  return buildChart(computePoints(sortReadings(readings)));
}

function rollbackCallout(
  drops: readonly { readonly prev: OdometerReading; readonly next: OdometerReading }[],
): HTMLElement {
  const list = el('div', {});
  for (const drop of drops) {
    list.append(
      el(
        'p',
        { class: 'note', style: 'margin-top:0.4rem' },
        `${formatNumber(drop.prev.miles)} mi on ${formatDate(drop.prev.date)} → ` +
        `${formatNumber(drop.next.miles)} mi on ${formatDate(drop.next.date)}`,
      ),
    );
  }
  return el(
    'div',
    { class: 'callout callout--danger' },
    el(
      'p',
      {},
      el('span', { class: 'badge badge--danger' }, 'Possible rollback'),
    ),
    el(
      'p',
      { class: 'note', style: 'margin-top:0.6rem' },
      'A later reading is lower than an earlier one. Data-entry typos happen ' +
      'at inspection stations, but treat this as a red flag until explained.',
    ),
    list,
  );
}

function readingsTable(readings: readonly OdometerReading[]): HTMLElement {
  const rows = readings.map((reading) =>
    el(
      'tr',
      {},
      el('td', { class: 'num' }, formatDate(reading.date)),
      el('td', { class: 'num' }, `${formatNumber(reading.miles)} mi`),
      el('td', {}, reading.source),
      el('td', {}, reading.note ?? ''),
    ),
  );
  return el(
    'details',
    { class: 'odo-table-details' },
    el('summary', {}, 'View readings as a table'),
    el(
      'div',
      { class: 'table-scroll' },
      el(
        'table',
        { class: 'data-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { scope: 'col' }, 'Date'),
            el('th', { scope: 'col' }, 'Odometer'),
            el('th', { scope: 'col' }, 'Source'),
            el('th', { scope: 'col' }, 'Note'),
          ),
        ),
        el('tbody', {}, ...rows),
      ),
    ),
  );
}


/* ---------- NY inspection detail ---------- */

/** "INITIAL INSPECTION" → "Initial inspection". */
function sentence(text: string): string {
  const lower = text.toLowerCase().replace(/nyma/g, 'NYMA');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function resultTag(result: string | null): Node | string {
  if (result === null) return '—';
  const upper = result.toUpperCase();
  const tone = upper === 'PASS' ? 'ok' : upper === 'FAIL' ? 'danger' : 'muted';
  return el('span', { class: 'tag', 'data-tone': tone }, sentence(result));
}

/** What the NY record says about the vehicle itself, from its most recent inspection. */
function nyVehicleFacts(latest: NyInspectionDetail): HTMLElement | null {
  const vehicle = latest.vehicle;
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  return factList([
    ['Vehicle (as recorded by NY)', name || null],
    ['Fuel', vehicle.fuel ? sentence(vehicle.fuel) : null],
    ['Transmission', vehicle.transmission ? sentence(vehicle.transmission) : null],
    ['Hybrid', vehicle.hybrid === null ? null : vehicle.hybrid ? 'Yes' : 'No'],
    ['Weight class (lb)', vehicle.weightClass],
    ['Registration class', vehicle.registrationClass],
    ['Emissions area', latest.metroArea ? sentence(latest.metroArea) : null],
  ]);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function spanText(fromIso: string, toIso: string): string {
  const days = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
  if (days < 45) return days + (days === 1 ? ' day' : ' days');
  const months = Math.round(days / 30.44);
  if (months < 24) return months + ' months';
  return (days / 365.25).toFixed(1) + ' years';
}

/** Miles gained since the previous reading, with the time between them. */
function intervalText(previous: OdometerReading | undefined, reading: OdometerReading): string | null {
  if (!previous) return null;
  const delta = reading.miles - previous.miles;
  return (delta >= 0 ? '+' : '−') + formatNumber(Math.abs(delta)) + ' mi in ' + spanText(previous.date, reading.date);
}

/** One plain-language observation about how little or how much the odometer moved. */
function usageObservation(readings: readonly OdometerReading[]): string | null {
  const first = readings[0];
  const last = readings[readings.length - 1];
  if (!first || !last || first === last) return null;
  const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / MS_PER_DAY;
  const miles = last.miles - first.miles;
  if (days < 180 || miles < 0) return null;
  const perYear = Math.round(miles / (days / 365.25));
  if (perYear >= 1000) return null;
  return (
    'The odometer moved only ' + formatNumber(miles) + ' mi between the first and last inspection (' +
    spanText(first.date, last.date) + '). That can mean very little use, a stale or re-entered reading, or a unit that is mostly ' +
    'driven out of state; compare with other records.'
  );
}

function nyNotes(detail: NyInspectionDetail): HTMLElement | null {
  const items: string[] = [];
  if (detail.noRegistrationReason) items.push(sentence(detail.noRegistrationReason));
  if (detail.emissionsWaiver) items.push('Emissions waiver issued');
  if (detail.tenDayExtension) items.push('Ten-day extension issued');
  if (detail.warning) items.push('Warning: ' + sentence(detail.warning));
  if (detail.advisory) items.push('Advisory: ' + sentence(detail.advisory));
  if (detail.testType) items.push(sentence(detail.testType) + ' test');
  if (detail.componentsRemoved.length > 0) {
    items.push('Removed for inspection: ' + detail.componentsRemoved.map((part) => part.toLowerCase()).join('; '));
  }
  if (items.length === 0) return null;
  return el('ul', { class: 'ny-notes' }, ...items.map((item) => el('li', {}, item)));
}

/** Full inspection history, newest first, with everything the NY record carries. */
function nyHistory(readings: readonly OdometerReading[]): HTMLElement {
  const rows = readings
    .map((reading, index) => ({ reading, previous: readings[index - 1] }))
    .reverse()
    .map(({ reading, previous }) => {
      const detail = reading.ny;
      const interval = intervalText(previous, reading);
      return el(
        'tr',
        {},
        el('td', {}, formatDate(reading.date), detail?.validThrough ? el('span', { class: 'sub' }, 'valid through ' + formatDate(detail.validThrough)) : null),
        el('td', { class: 'num' }, formatNumber(reading.miles) + ' mi', interval ? el('span', { class: 'sub' }, interval) : null),
        el('td', {}, detail?.type ? sentence(detail.type) : '—'),
        el('td', {}, resultTag(detail?.safety ?? null)),
        el('td', {}, resultTag(detail?.emissions ?? null)),
        el('td', {}, (detail && nyNotes(detail)) ?? '—'),
      );
    });
  return el(
    'div',
    { class: 'table-scroll' },
    el(
      'table',
      { class: 'data-table ny-history' },
      el('caption', { class: 'visually-hidden' }, 'New York State inspection history'),
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ...['Inspected', 'Odometer', 'Type', 'Safety', 'Emissions', 'Notes'].map((heading) => el('th', { scope: 'col' }, heading)),
        ),
      ),
      el('tbody', {}, ...rows),
    ),
  );
}

export function renderOdometer(
  result: SectionResult<OdometerReading[]>,
  stateEmissionLinks: readonly GuidedLink[],
): HTMLElement {
  if (result.status === 'hit' && result.data && result.data.length > 0) {
    const readings = sortReadings(result.data);
    const points = computePoints(readings);
    const drops = findRollbacks(readings);
    const latestDetail = [...readings].reverse().find((reading) => reading.ny)?.ny;
    const hasNy = readings.some((reading) => reading.ny);
    const observation = usageObservation(readings);
    return el(
      'div',
      { class: 'card' },
      buildChart(points),
      drops.length > 0 ? rollbackCallout(drops) : null,
      observation ? el('p', { class: 'note ny-observation' }, observation) : null,
      latestDetail ? nyVehicleFacts(latestDetail) : null,
      hasNy ? nyHistory(readings) : readingsTable(readings),
    );
  }

  const wrap = el(
    'div',
    {},
    el(
      'p',
      { class: 'note' },
      result.note ??
        'No public odometer readings found. Free mileage records mostly come ' +
        'from state inspection programs — coverage depends on where the car lived.',
    ),
  );
  if (stateEmissionLinks.length > 0) {
    const rows = el('div', { class: 'link-rows', style: 'margin-top:0.5rem' });
    for (const link of stateEmissionLinks) rows.append(guidedLinkRow(link));
    wrap.append(
      el(
        'p',
        { class: 'note', style: 'margin-top:1rem' },
        el('strong', {}, 'Check your state instead: '),
        'many emissions and inspection programs publish per-VIN mileage.',
      ),
      rows,
    );
  }
  return wrap;
}
