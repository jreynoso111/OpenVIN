/** Section 3 — recall campaigns: count headline + expandable rows. */

import type { GuidedLink, RecallCampaign, SectionResult } from '../lib/types';
import { el, formatDate, svgEl } from './dom';
import { guidedLinkCard } from './links';

function chevron(): SVGElement {
  const icon = svgEl('svg', {
    class: 'recall__chevron',
    viewBox: '0 0 12 12',
    width: 12,
    height: 12,
    'aria-hidden': 'true',
  });
  icon.append(
    svgEl('path', {
      d: 'M4 2.5 L8 6 L4 9.5',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  return icon;
}

function detailPara(label: string, text: string): HTMLElement | null {
  if (!text || !text.trim()) return null;
  return el('p', {}, el('strong', {}, `${label}: `), text);
}

function recallRow(campaign: RecallCampaign): HTMLElement {
  const badges: HTMLElement[] = [];
  if (campaign.parkIt) {
    badges.push(el('span', { class: 'badge badge--danger' }, 'Do not drive'));
  }
  if (campaign.parkOutSide) {
    badges.push(el('span', { class: 'badge badge--danger' }, 'Park outside'));
  }
  if (campaign.overTheAirUpdate) {
    badges.push(el('span', { class: 'badge badge--neutral' }, 'OTA update'));
  }

  const body = el('div', { class: 'recall__body' });
  const paras = [
    detailPara('Summary', campaign.summary),
    detailPara('Consequence', campaign.consequence),
    detailPara('Remedy', campaign.remedy),
  ];
  for (const para of paras) {
    if (para) body.append(para);
  }
  body.append(
    el('p', { class: 'note' }, `NHTSA campaign ${campaign.campaignNumber}`),
  );

  return el(
    'details',
    { class: 'recall' },
    el(
      'summary',
      {},
      el('span', { class: 'recall__component' }, campaign.component),
      ...badges,
      el(
        'span',
        { class: 'recall__date' },
        formatDate(campaign.reportReceivedDate),
      ),
      chevron(),
    ),
    body,
  );
}

export function renderRecalls(
  result: SectionResult<RecallCampaign[]>,
  oemLink: GuidedLink | undefined,
): HTMLElement {
  const wrap = el('div', {});

  if (result.status === 'hit' && result.data) {
    const campaigns = result.data;
    if (campaigns.length === 0) {
      wrap.append(
        el(
          'div',
          { class: 'all-clear' },
          el('span', { class: 'dot dot--ok' }),
          el(
            'span',
            {},
            'No recall campaigns found',
            el(
              'span',
              { class: 'all-clear__precision' },
              'For this year, make, and model — campaigns opened later would not appear yet.',
            ),
          ),
        ),
      );
    } else {
      wrap.append(
        el(
          'div',
          { class: 'count-headline' },
          el('span', { class: 'count-headline__num' }, String(campaigns.length)),
          el(
            'span',
            { class: 'count-headline__label' },
            campaigns.length === 1
              ? 'recall campaign for this vehicle line'
              : 'recall campaigns for this vehicle line',
          ),
        ),
      );
      const list = el('div', { class: 'recall-list' });
      for (const campaign of campaigns) list.append(recallRow(campaign));
      wrap.append(list);
    }
  } else {
    wrap.append(
      el(
        'p',
        { class: 'note' },
        result.note ?? 'Recall data could not be loaded right now.',
      ),
    );
  }

  if (oemLink) {
    wrap.append(
      el(
        'div',
        { class: 'callout' },
        el(
          'p',
          { class: 'note', style: 'margin-bottom:0.75rem' },
          el('strong', {}, 'Is this exact VIN still affected? '),
          'Campaign lists cover the vehicle line. The manufacturer’s own ' +
          'lookup shows whether THIS VIN has an open, unrepaired recall.',
        ),
        guidedLinkCard(oemLink),
      ),
    );
  }

  return wrap;
}
