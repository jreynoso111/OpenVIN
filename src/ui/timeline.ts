/** One chronological axis: inspections, plate changes, carrier changes. */

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

function eventRow(event: TimelineEvent): HTMLElement {
  return el(
    'li',
    { class: 'tl__item', 'data-kind': event.kind },
    el('time', { class: 'tl__date', datetime: event.date }, formatDate(event.date)),
    el('span', { class: 'tl__dot', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'tl__body' },
      el('span', { class: 'tl__kind' }, KIND_LABEL[event.kind]),
      el('strong', { class: 'tl__title' }, event.title),
      event.plate ? el('span', { class: 'tl__detail' }, platePivot(event.plate.plate, event.plate.state)) : null,
      event.dot ? el('span', { class: 'tl__detail' }, dotPivot(event.dot, event.detail ?? undefined)) : null,
      !event.plate && !event.dot && event.detail ? el('span', { class: 'tl__detail' }, event.detail) : null,
    ),
  );
}

export function renderTimeline(records: readonly CommercialInspection[]): HTMLElement {
  const events = buildTimeline(records);
  if (events.length === 0) return emptyNote('No dated inspections to place on a timeline.');

  const list = el('ol', { class: 'tl' });
  let year = '';
  for (const event of events) {
    const eventYear = event.date.slice(0, 4);
    if (eventYear !== year) {
      year = eventYear;
      list.append(el('li', { class: 'tl__year', 'aria-hidden': 'true' }, eventYear));
    }
    list.append(eventRow(event));
  }
  return list;
}
