/**
 * NHTSA recalls and complaints. Both describe the year/make/model line, not
 * this exact VIN, and the copy says so. Rows expand in place.
 */

import type { ComplaintsSummary, GuidedLink, RecallCampaign, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { emptyNote } from './panel';

/** Rows listed before "show more", and how many of them start expanded. */
const SHOWN_ROWS = 10;
const OPEN_ROWS = 3;

/** Expand the first few rows so each section reads as a full report, not a list of titles. */
function startOpen(row: HTMLElement, index: number): HTMLElement {
  if (index < OPEN_ROWS) (row as HTMLDetailsElement).open = true;
  return row;
}

function detail(label: string, text: string): HTMLElement | null {
  return text.trim() ? el('p', {}, el('strong', {}, label + ': '), text) : null;
}

function recallRow(campaign: RecallCampaign): HTMLElement {
  return el(
    'details',
    { class: 'mrow' },
    el(
      'summary',
      {},
      el('span', { class: 'mrow__title' }, campaign.component || 'Recall'),
      campaign.parkIt ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Do not drive') : null,
      campaign.parkOutSide ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Park outside') : null,
      campaign.overTheAirUpdate ? el('span', { class: 'tag', 'data-tone': 'muted' }, 'OTA update') : null,
      el('span', { class: 'mrow__date' }, formatDate(campaign.reportReceivedDate)),
    ),
    el(
      'div',
      { class: 'mrow__body' },
      detail('Summary', campaign.summary),
      detail('Consequence', campaign.consequence),
      detail('Remedy', campaign.remedy),
      el('p', { class: 'muted' }, 'NHTSA campaign ' + campaign.campaignNumber),
    ),
  );
}

export function renderRecalls(
  result: SectionResult<RecallCampaign[]>,
  oemLink: GuidedLink | undefined,
): HTMLElement {
  const wrap = el('div', { class: 'mline' });
  if (result.status !== 'hit' || !result.data) {
    wrap.append(emptyNote(result.note ?? 'Recall data could not be loaded right now.'));
  } else if (result.data.length === 0) {
    wrap.append(emptyNote('NHTSA lists no recall campaigns for this year, make and model.'));
  } else {
    const urgent = result.data.filter((c) => c.parkIt || c.parkOutSide).length;
    wrap.append(
      el(
        'p',
        { class: 'mline__lead' },
        el('strong', {}, formatNumber(result.data.length)),
        ' recall campaign' + (result.data.length === 1 ? '' : 's') + ' for this model line',
        urgent > 0 ? el('span', { class: 'tag', 'data-tone': 'danger' }, formatNumber(urgent) + ' say stop driving') : null,
      ),
      el('div', { class: 'mrows' }, ...result.data.slice(0, SHOWN_ROWS).map((c, i) => startOpen(recallRow(c), i))),
    );
    if (result.data.length > SHOWN_ROWS) {
      wrap.append(
        el(
          'details',
          { class: 'state-more' },
          el('summary', {}, 'Show ' + (result.data.length - SHOWN_ROWS) + ' more'),
          el('div', { class: 'mrows' }, ...result.data.slice(SHOWN_ROWS).map(recallRow)),
        ),
      );
    }
  }
  wrap.append(
    el(
      'p',
      { class: 'mline__foot' },
      'Campaigns cover the model line. Only the manufacturer can say whether this exact VIN is affected and repaired',
      oemLink ? ' — ' : '.',
      oemLink ? el('a', { href: oemLink.url, target: '_blank', rel: 'noopener noreferrer' }, oemLink.label + ' ↗') : null,
    ),
  );
  return wrap;
}

export function renderComplaints(result: SectionResult<ComplaintsSummary>): HTMLElement {
  const wrap = el('div', { class: 'mline' });
  if (result.status !== 'hit' || !result.data) {
    wrap.append(emptyNote(result.note ?? 'Complaint data could not be loaded right now.'));
    return wrap;
  }
  const s = result.data;
  wrap.append(
    el(
      'p',
      { class: 'mline__lead' },
      el('strong', {}, formatNumber(s.totalForVehicleLine)),
      ' owner complaints filed for this model line · ',
      formatNumber(s.crashCount) + ' crashes · ' + formatNumber(s.fireCount) + ' fires',
    ),
  );
  if (s.vinMatches.length > 0) {
    wrap.append(
      el(
        'p',
        { class: 'mline__sub' },
        formatNumber(s.vinMatches.length) + ' share this VIN’s first 11 characters (a build family, not proof of this truck):',
      ),
      el(
        'div',
        { class: 'mrows' },
        ...s.vinMatches.slice(0, SHOWN_ROWS).map((c, i) =>
          startOpen(el(
            'details',
            { class: 'mrow' },
            el(
              'summary',
              {},
              el('span', { class: 'mrow__title' }, c.components || 'Complaint'),
              c.crash ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Crash') : null,
              c.fire ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Fire') : null,
              c.numberOfInjuries > 0 ? el('span', { class: 'tag', 'data-tone': 'warn' }, formatNumber(c.numberOfInjuries) + ' injured') : null,
              c.numberOfDeaths > 0 ? el('span', { class: 'tag', 'data-tone': 'danger' }, formatNumber(c.numberOfDeaths) + ' deaths') : null,
              el('span', { class: 'mrow__date' }, formatDate(c.dateOfIncident ?? c.dateComplaintFiled)),
            ),
            el(
              'div',
              { class: 'mrow__body' },
              el('p', {}, c.summary || 'No narrative.'),
              el('p', { class: 'muted' }, 'Filed ' + formatDate(c.dateComplaintFiled) + (c.dateOfIncident ? ' · incident ' + formatDate(c.dateOfIncident) : '') + ' · NHTSA ODI ' + c.odiNumber),
            ),
          ), i),
        ),
      ),
    );
  }
  wrap.append(el('p', { class: 'mline__foot' }, 'Complaints are unverified reports from owners, filed with NHTSA.'));
  return wrap;
}
