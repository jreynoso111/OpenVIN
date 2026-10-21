/**
 * Horizontal timeline, oldest on the left, newest on the right. Events that
 * happened on the same day share one stop on the axis, and years are marked
 * on the rail. The track scrolls sideways when it is wider than the panel and
 * opens at the newest stop.
 */

import { buildTimeline, type TimelineEvent } from '../lib/analysis';
import type { CommercialInspection } from '../lib/types';
import { el, formatDate } from './dom';
import { dotPivot, platePivot } from './pivot';
import { emptyNote } from './panel';

const KIND_LABEL: Readonly<Record<TimelineEvent['kind'], string>> = {
  inspection: 'Inspection',
  oos: 'Out of service',
  plate: 'Plate',
  carrier: 'Carrier',
};

function eventLine(event: TimelineEvent): HTMLElement {
  return el(
    'li',
    { class: 'htl__event', 'data-kind': event.kind },
    el('span', { class: 'htl__kind' }, KIND_LABEL[event.kind]),
    el('strong', { class: 'htl__title' }, event.title),
    event.plate ? el('span', { class: 'htl__detail' }, platePivot(event.plate.plate, event.plate.state)) : null,
    event.dot ? el('span', { class: 'htl__detail' }, dotPivot(event.dot, event.detail ?? undefined)) : null,
    !event.plate && !event.dot && event.detail ? el('span', { class: 'htl__detail' }, event.detail) : null,
    event.inspectionId ? el('span', { class: 'htl__record' }, 'VIN-matched FMCSA inspection #', event.inspectionId) : null,
  );
}

interface Stop {
  date: string;
  events: TimelineEvent[];
}

/** Group events by day, oldest first. Pure; exported for tests. */
export function stopsByDay(events: readonly TimelineEvent[]): Stop[] {
  const map = new Map<string, TimelineEvent[]>();
  // buildTimeline is newest first; walk it backwards so each day keeps its
  // carrier → plate → inspection reading order.
  for (const event of [...events].reverse()) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  return [...map.entries()]
    .map(([date, list]) => ({
      date,
      events: [...list].sort((a, b) => weight(a.kind) - weight(b.kind)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function weight(kind: TimelineEvent['kind']): number {
  return { carrier: 0, plate: 1, inspection: 2, oos: 2 }[kind];
}

export function renderTimeline(records: readonly CommercialInspection[]): HTMLElement {
  const stops = stopsByDay(buildTimeline(records));
  if (stops.length === 0) return emptyNote('No dated inspections to place on a timeline.');

  const track = el('ol', { class: 'htl__track' });
  let year = '';
  for (const stop of stops) {
    const stopYear = stop.date.slice(0, 4);
    const newYear = stopYear !== year;
    year = stopYear;
    const hasOos = stop.events.some((e) => e.kind === 'oos');
    track.append(
      el(
        'li',
        { class: 'htl__stop', 'data-oos': hasOos ? 'true' : 'false', 'data-year': newYear ? 'true' : 'false' },
        newYear ? el('span', { class: 'htl__year' }, stopYear) : null,
        el('span', { class: 'htl__dot', 'aria-hidden': 'true' }),
        el('time', { class: 'htl__date', datetime: stop.date }, formatDate(stop.date)),
        el('ul', { class: 'htl__events' }, ...stop.events.map(eventLine)),
      ),
    );
  }

  const scroller = el(
    'div',
    { class: 'htl', tabindex: '0', role: 'region', 'aria-label': 'Timeline, scroll sideways for older events' },
    track,
  );
  // Open on the newest stop; layout is not ready until it is attached.
  requestAnimationFrame(() => {
    scroller.scrollLeft = scroller.scrollWidth;
  });
  return el(
    'div',
    { class: 'htl-wrap' },
    scroller,
    stops.length > 3 ? el('p', { class: 'htl__hint' }, '← Older · scroll sideways · Newer →') : null,
  );
}
