/** Section 4 — owner complaints: exact-VIN matches first, then line stats. */

import type { ComplaintRecord, ComplaintsSummary, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { collapsedList } from './expander';
import { componentsBarChart } from './viz';

const VISIBLE_CARDS = 3;

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

  // Components are only published per-record; we chart the VIN-matched set.
  const chart =
    summary.vinMatches.length > 1
      ? componentsBarChart(
          summary.vinMatches,
          'Top components in complaints filed on this exact vehicle',
        )
      : null;
  if (chart) wrap.append(chart);

  if (summary.vinMatches.length > 0) {
    wrap.append(
      collapsedList({
        items: summary.vinMatches.map(complaintCard),
        visibleCount: VISIBLE_CARDS,
        listClass: 'complaint-cards',
        expandLabel: `Show all ${summary.vinMatches.length} complaints on this VIN`,
        collapseLabel: 'Show fewer complaints',
      }),
    );
  } else {
    wrap.append(
      el(
        'p',
        { class: 'note' },
        'No federal complaint on file matches this exact VIN. ' +
        'Figures below cover the whole vehicle line.',
      ),
    );
  }

  wrap.append(
    el(
      'div',
      { class: 'stat-row', style: 'margin-top:1rem' },
      stat(formatNumber(summary.totalForVehicleLine), 'complaints for this vehicle line'),
      stat(formatNumber(summary.crashCount), 'involved a crash'),
      stat(formatNumber(summary.fireCount), 'involved a fire'),
    ),
  );

  return wrap;
}
