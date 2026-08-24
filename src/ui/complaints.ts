/** Section 4 — owner complaints: exact-VIN matches first, then line stats. */

import type { ComplaintRecord, ComplaintsSummary, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';

function complaintCard(record: ComplaintRecord): HTMLElement {
  const badges = el(
    'div',
    { class: 'complaint-card__badges' },
    el('span', { class: 'badge badge--accent' }, 'Filed on this exact vehicle'),
    record.crash ? el('span', { class: 'badge badge--danger' }, 'Crash') : null,
    record.fire ? el('span', { class: 'badge badge--danger' }, 'Fire') : null,
    record.numberOfInjuries > 0
      ? el(
          'span',
          { class: 'badge badge--warn' },
          `${formatNumber(record.numberOfInjuries)} injured`,
        )
      : null,
    record.numberOfDeaths > 0
      ? el(
          'span',
          { class: 'badge badge--danger' },
          `${formatNumber(record.numberOfDeaths)} deaths`,
        )
      : null,
  );

  const metaParts = [
    `Filed ${formatDate(record.dateComplaintFiled)}`,
    record.dateOfIncident ? `incident ${formatDate(record.dateOfIncident)}` : null,
    record.components || null,
    `ODI ${record.odiNumber}`,
  ].filter((part): part is string => Boolean(part));

  return el(
    'article',
    { class: 'card complaint-card' },
    badges,
    el('p', { class: 'complaint-card__meta' }, metaParts.join(' · ')),
    el('p', { class: 'complaint-card__summary' }, record.summary),
  );
}

function stat(num: string, label: string): HTMLElement {
  return el(
    'div',
    { class: 'card stat' },
    el('div', { class: 'stat__num' }, num),
    el('div', { class: 'stat__label' }, label),
  );
}

export function renderComplaints(
  result: SectionResult<ComplaintsSummary>,
): HTMLElement {
  if (result.status !== 'hit' || !result.data) {
    return el(
      'p',
      { class: 'note' },
      result.note ?? 'Complaint data could not be loaded right now.',
    );
  }

  const summary = result.data;
  const wrap = el('div', {});

  if (summary.vinMatches.length > 0) {
    const cards = el('div', { class: 'complaint-cards' });
    for (const record of summary.vinMatches) cards.append(complaintCard(record));
    wrap.append(cards);
  } else {
    wrap.append(
      el(
        'p',
        { class: 'note', style: 'margin-bottom:1.25rem' },
        'No federal complaint on file matches this exact VIN. ' +
        'Figures below cover the whole vehicle line.',
      ),
    );
  }

  wrap.append(
    el(
      'div',
      { class: 'stat-row' },
      stat(formatNumber(summary.totalForVehicleLine), 'complaints for this vehicle line'),
      stat(formatNumber(summary.crashCount), 'involved a crash'),
      stat(formatNumber(summary.fireCount), 'involved a fire'),
    ),
  );

  return wrap;
}
