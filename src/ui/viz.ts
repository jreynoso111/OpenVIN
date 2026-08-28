/**
 * Hand-rolled inline-SVG mini-charts — Apple-Health restraint: hairline
 * strokes, one accent, direct labels, no chart-junk. Theme-aware via CSS
 * custom properties; every chart pairs an aria-hidden SVG with a
 * visually-hidden text equivalent.
 */

import type { ComplaintRecord, FuelEconomy, RecallCampaign } from '../lib/types';
import { el, formatNumber, svgEl } from './dom';

/* ---------- Complaints: top component categories ---------- */

const MAX_COMPONENT_BARS = 6;
const BARS_W = 560;
const BAR_ROW_H = 38;
const BAR_MAX_W = BARS_W - 64;
const LABEL_MAX_CHARS = 46;

interface ComponentCount {
  readonly label: string;
  readonly count: number;
}

function sentenceCase(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/:/g, ' · ').replace(/\s+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Aggregate the `components` field (comma/pipe separated) across records. */
export function aggregateComponents(
  records: readonly ComplaintRecord[],
): ComponentCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const token of record.components.split(/[,|]/)) {
      const key = token.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COMPONENT_BARS)
    .map(([label, count]) => ({ label: sentenceCase(label), count }));
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Horizontal bar chart of top complaint components. Returns null when the
 * records carry no parseable component data.
 */
export function componentsBarChart(
  records: readonly ComplaintRecord[],
  caption: string,
): HTMLElement | null {
  const items = aggregateComponents(records);
  if (items.length === 0) return null;
  const max = items[0]?.count ?? 1;
  const height = items.length * BAR_ROW_H + 4;
  const chart = svgEl('svg', {
    class: 'viz-svg viz-bars',
    viewBox: `0 0 ${BARS_W} ${height}`,
    'aria-hidden': 'true',
  });
  items.forEach((item, index) => {
    const y = index * BAR_ROW_H + 2;
    const barW = Math.max(6, (item.count / max) * BAR_MAX_W);
    chart.append(
      svgEl(
        'text',
        { class: 'viz-label', x: 0, y: y + 11 },
        truncate(item.label, LABEL_MAX_CHARS),
      ),
      svgEl('rect', {
        class: 'viz-bar',
        x: 0,
        y: y + 17,
        width: barW.toFixed(1),
        height: 9,
        rx: 4.5,
      }),
      svgEl(
        'text',
        { class: 'viz-value', x: barW + 10, y: y + 25.5 },
        formatNumber(item.count),
      ),
    );
  });
  const summary = items
    .map((item) => `${item.label} (${formatNumber(item.count)})`)
    .join(', ');
  return el(
    'figure',
    { class: 'viz' },
    el('figcaption', { class: 'viz-caption' }, caption),
    chart,
    el('p', { class: 'visually-hidden' }, `${caption}: ${summary}.`),
  );
}

/* ---------- Recalls: campaign year timeline ---------- */

const TL_W = 560;
const TL_H = 56;
const TL_PAD = 12;
const TL_AXIS_Y = 40;
const TL_STACK_STEP = 9;
const TL_STACK_CAP = 3;

interface TimelinePoint {
  readonly year: number;
  readonly hazard: boolean;
}

/** Compact year strip: one dot per campaign, red when park-it/park-outside. */
export function recallTimeline(
  campaigns: readonly RecallCampaign[],
): HTMLElement | null {
  const points: TimelinePoint[] = [];
  for (const campaign of campaigns) {
    const year = new Date(campaign.reportReceivedDate).getFullYear();
    if (!Number.isFinite(year)) continue;
    points.push({ year, hazard: campaign.parkIt || campaign.parkOutSide });
  }
  if (points.length === 0) return null;

  const years = points.map((point) => point.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const span = maxYear - minYear || 1;
  const innerW = TL_W - TL_PAD * 2;

  const chart = svgEl('svg', {
    class: 'viz-svg viz-timeline',
    viewBox: `0 0 ${TL_W} ${TL_H}`,
    'aria-hidden': 'true',
  });
  chart.append(
    svgEl('line', {
      class: 'viz-axis',
      x1: TL_PAD,
      y1: TL_AXIS_Y,
      x2: TL_W - TL_PAD,
      y2: TL_AXIS_Y,
    }),
  );

  const stack = new Map<number, number>();
  // Oldest first so stacked duplicates grow upward chronologically.
  for (const point of [...points].sort((a, b) => a.year - b.year)) {
    const x = minYear === maxYear
      ? TL_W / 2
      : TL_PAD + ((point.year - minYear) / span) * innerW;
    const level = Math.min(stack.get(point.year) ?? 0, TL_STACK_CAP);
    stack.set(point.year, (stack.get(point.year) ?? 0) + 1);
    chart.append(
      svgEl('circle', {
        class: point.hazard ? 'viz-dot viz-dot--danger' : 'viz-dot',
        cx: x.toFixed(1),
        cy: TL_AXIS_Y - 7 - level * TL_STACK_STEP,
        r: 4,
      }),
    );
  }

  if (minYear === maxYear) {
    chart.append(
      svgEl(
        'text',
        { class: 'viz-label', x: TL_W / 2, y: TL_H - 2, 'text-anchor': 'middle' },
        String(minYear),
      ),
    );
  } else {
    chart.append(
      svgEl('text', { class: 'viz-label', x: TL_PAD, y: TL_H - 2 }, String(minYear)),
      svgEl(
        'text',
        { class: 'viz-label', x: TL_W - TL_PAD, y: TL_H - 2, 'text-anchor': 'end' },
        String(maxYear),
      ),
    );
  }

  const hazardCount = points.filter((point) => point.hazard).length;
  const summary =
    `${formatNumber(points.length)} campaigns reported between ${minYear} and ` +
    `${maxYear}${hazardCount > 0
      ? `; ${formatNumber(hazardCount)} carry do-not-drive or park-outside warnings`
      : ''}.`;
  return el(
    'div',
    { class: 'viz viz--flush' },
    chart,
    el('p', { class: 'visually-hidden' }, summary),
  );
}

/* ---------- Fuel economy: three vertical MPG bars ---------- */

const MPG_W = 260;
const MPG_H = 150;
const MPG_BOTTOM = 118;
const MPG_MAX_H = 84;
const MPG_BAR_W = 56;

/** City / Combined / Highway vertical bars with direct value labels. */
export function mpgBars(fuel: FuelEconomy): HTMLElement | null {
  const slots = [
    { label: 'City', value: fuel.city, x: 20, combined: false },
    { label: 'Combined', value: fuel.combined, x: 102, combined: true },
    { label: 'Highway', value: fuel.highway, x: 184, combined: false },
  ];
  const values = slots
    .map((slot) => slot.value)
    .filter((value): value is number => value !== null && value > 0);
  if (values.length === 0) return null;
  const max = Math.max(...values);

  const chart = svgEl('svg', {
    class: 'viz-svg viz-mpg',
    viewBox: `0 0 ${MPG_W} ${MPG_H}`,
    'aria-hidden': 'true',
  });
  for (const slot of slots) {
    const center = slot.x + MPG_BAR_W / 2;
    if (slot.value !== null && slot.value > 0) {
      const barH = Math.max(6, (slot.value / max) * MPG_MAX_H);
      const top = MPG_BOTTOM - barH;
      chart.append(
        svgEl('rect', {
          class: slot.combined ? 'viz-bar viz-bar--accent' : 'viz-bar',
          x: slot.x,
          y: top.toFixed(1),
          width: MPG_BAR_W,
          height: barH.toFixed(1),
          rx: 5,
        }),
        svgEl(
          'text',
          {
            class: slot.combined ? 'viz-num viz-num--accent' : 'viz-num',
            x: center,
            y: (top - 8).toFixed(1),
            'text-anchor': 'middle',
          },
          String(slot.value),
        ),
      );
    } else {
      chart.append(
        svgEl(
          'text',
          { class: 'viz-value', x: center, y: MPG_BOTTOM - 8, 'text-anchor': 'middle' },
          '—',
        ),
      );
    }
    chart.append(
      svgEl(
        'text',
        { class: 'viz-label', x: center, y: MPG_H - 10, 'text-anchor': 'middle' },
        slot.label,
      ),
    );
  }

  const summary = slots
    .map((slot) => `${slot.label} ${slot.value ?? 'not published'}`)
    .join(', ');
  return el(
    'div',
    { class: 'viz viz--flush' },
    chart,
    el('p', { class: 'visually-hidden' }, `MPG: ${summary}.`),
  );
}

/* ---------- Safety: 5-segment rating bar ---------- */

const SEGMENTS = 5;
const SEG_W = 22;
const SEG_GAP = 4;
const SEG_H = 10;

/** Five-segment bar; filled segments = stars. Not-rated = empty track. */
export function ratingSegments(rating: string | null): HTMLElement {
  const parsed = rating === null ? NaN : Number.parseInt(rating, 10);
  const isRated = !Number.isNaN(parsed) && parsed >= 1 && parsed <= SEGMENTS;
  const filled = isRated ? parsed : 0;
  const totalW = SEGMENTS * SEG_W + (SEGMENTS - 1) * SEG_GAP;
  const chart = svgEl('svg', {
    class: 'viz-segments',
    viewBox: `0 0 ${totalW} ${SEG_H}`,
    'aria-hidden': 'true',
  });
  for (let i = 0; i < SEGMENTS; i += 1) {
    chart.append(
      svgEl('rect', {
        class: i < filled ? 'viz-seg viz-seg--on' : 'viz-seg',
        x: i * (SEG_W + SEG_GAP),
        y: 0,
        width: SEG_W,
        height: SEG_H,
        rx: 3,
      }),
    );
  }
  return el(
    'span',
    {
      class: 'rating-cell',
      role: 'img',
      'aria-label': isRated
        ? `${parsed} out of ${SEGMENTS} stars`
        : (rating ?? 'Not rated'),
    },
    chart,
    el(
      'span',
      { class: isRated ? 'rating-cell__num' : 'rating-cell__na', 'aria-hidden': 'true' },
      isRated ? `${parsed}/${SEGMENTS}` : (rating ?? 'Not rated'),
    ),
  );
}
