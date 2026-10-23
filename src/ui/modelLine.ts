/**
 * NHTSA recalls and complaints. Both describe the year/make/model line, not
 * this exact VIN, and the copy says so. Rows expand in place.
 */

import type { ComplaintsSummary, GuidedLink, RecallCampaign, SectionResult } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { emptyNote } from './panel';

/** Rows listed before "show more", and how many of them start expanded. */
const SHOWN_ROWS = 5;

/** "SERVICE BRAKES, AIR:DISC:CALIPER" -> "Service brakes, air › Disc › Caliper". */
export function readableComponent(raw: string): string {
  const text = raw.trim().toLowerCase().split(':').map((part) => part.trim()).filter(Boolean).join(' › ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** First sentence of a long NHTSA text, cut to fit one line of a collapsed row. */
function snippet(text: string, max = 170): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)) + '…';
}

/** Campaign counts by top-level component, most common first. */
function componentCounts(campaigns: readonly RecallCampaign[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const c of campaigns) {
    const top = readableComponent((c.component || 'Other').split(':')[0] ?? 'Other');
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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
      el('span', { class: 'mrow__title' }, readableComponent(campaign.component) || 'Recall'),
      campaign.parkIt ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Do not drive') : null,
      campaign.parkOutSide ? el('span', { class: 'tag', 'data-tone': 'danger' }, 'Park outside') : null,
      campaign.overTheAirUpdate ? el('span', { class: 'tag', 'data-tone': 'muted' }, 'OTA update') : null,
      el('span', { class: 'mrow__date' }, formatDate(campaign.reportReceivedDate)),
      campaign.summary ? el('span', { class: 'mrow__snippet' }, snippet(campaign.summary)) : null,
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
  line = 'this model line',
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
        ' recall campaign' + (result.data.length === 1 ? '' : 's') + ' filed for the ' + line,
        urgent > 0 ? el('span', { class: 'tag', 'data-tone': 'danger' }, formatNumber(urgent) + ' say stop driving') : null,
      ),
      el(
        'p',
        { class: 'mline__sub' },
        'Each campaign covers only certain builds, engines and production dates of the model line, so most of these will not apply to this exact truck. ' +
          'Open a campaign to read which vehicles it names; only the manufacturer or NHTSA’s VIN lookup can say what applies to this VIN.',
      ),
      el(
        'ul',
        { class: 'chips__list' },
        ...componentCounts(result.data).map(([name, count]) =>
          el('li', { class: 'chip' }, el('span', { class: 'chip__label' }, name), el('span', { class: 'chip__count' }, '×' + count)),
        ),
      ),
      el('div', { class: 'mrows' }, ...result.data.slice(0, SHOWN_ROWS).map((c) => recallRow(c))),
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
        ...s.vinMatches.slice(0, SHOWN_ROWS).map((c) =>
          (el(
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
          )),
        ),
      ),
    );
  }
  wrap.append(el('p', { class: 'mline__foot' }, 'Complaints are unverified reports from owners, filed with NHTSA.'));
  return wrap;
}
