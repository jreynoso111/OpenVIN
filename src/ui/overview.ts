/**
 * Overview tab panel — the highest-signal detail under the persistent
 * summary band: park-it/park-outside recall alert, compact odometer trend,
 * and the two official-check actions. Hydrates from the same promises as
 * the full sections (guarded upstream by callbacks.isCurrent()).
 */

import type {
  GuidedLink,
  OdometerReading,
  RecallCampaign,
  SectionResult,
} from '../lib/types';
import { clear, el, formatDate, formatNumber, revealOnce } from './dom';
import { officialActionGrid } from './links';
import { buildOdometerChart, sortReadings } from './odometer';
import { cardsSkeleton, chartSkeleton } from './skeleton';

export interface Overview {
  readonly root: HTMLElement;
  setRecalls(result: SectionResult<RecallCampaign[]>): void;
  setOdometer(result: SectionResult<OdometerReading[]>): void;
  setOfficial(links: readonly GuidedLink[]): void;
}

function hazardRow(campaign: RecallCampaign): HTMLElement {
  return el(
    'div',
    { class: 'overview-alert__row' },
    el('span', { class: 'overview-alert__component' }, campaign.component),
    campaign.parkIt
      ? el('span', { class: 'badge badge--danger' }, 'Do not drive')
      : null,
    campaign.parkOutSide
      ? el('span', { class: 'badge badge--danger' }, 'Park outside')
      : null,
    el(
      'span',
      { class: 'overview-alert__date' },
      formatDate(campaign.reportReceivedDate),
    ),
  );
}

export function createOverview(onViewRecalls: () => void): Overview {
  const alertSlot = el('div', { class: 'overview__alert' });
  alertSlot.hidden = true;
  const chartSlot = el(
    'div',
    { class: 'card overview__chart' },
    chartSkeleton(),
  );
  const officialSlot = el('div', { class: 'overview__official' }, cardsSkeleton(2));
  const root = el('div', { class: 'overview' }, alertSlot, chartSlot, officialSlot);

  return {
    root,

    setRecalls(result: SectionResult<RecallCampaign[]>): void {
      const campaigns = result.status === 'hit' && result.data ? result.data : [];
      const hazards = campaigns.filter(
        (campaign) => campaign.parkIt || campaign.parkOutSide,
      );
      if (hazards.length === 0) return;
      clear(alertSlot);
      alertSlot.append(
        el(
          'div',
          { class: 'callout callout--danger overview-alert' },
          el(
            'p',
            { class: 'overview-alert__title' },
            `⚠ ${hazards.length === 1 ? 'A recall campaign carries' : `${formatNumber(hazards.length)} recall campaigns carry`} a stop-driving or park-outside warning`,
          ),
          ...hazards.map(hazardRow),
          el(
            'button',
            {
              class: 'expander-btn',
              type: 'button',
              onclick: () => onViewRecalls(),
            },
            'View all recalls',
          ),
        ),
      );
      alertSlot.hidden = false;
      revealOnce(alertSlot);
    },

    setOdometer(result: SectionResult<OdometerReading[]>): void {
      if (result.status !== 'hit' || !result.data || result.data.length === 0) {
        chartSlot.hidden = true;
        return;
      }
      const readings = sortReadings(result.data);
      const last = readings[readings.length - 1];
      clear(chartSlot);
      chartSlot.append(
        el('p', { class: 'overview__slot-title' }, 'Odometer trend'),
        buildOdometerChart(readings),
      );
      if (last) {
        chartSlot.append(
          el(
            'p',
            { class: 'note--micro' },
            `Last public reading: ${formatNumber(last.miles)} mi · ${formatDate(last.date)}`,
          ),
        );
      }
      revealOnce(chartSlot);
    },

    setOfficial(links: readonly GuidedLink[]): void {
      clear(officialSlot);
      officialSlot.append(
        el('p', { class: 'overview__slot-title' }, 'Run the official checks'),
        officialActionGrid(links),
      );
      revealOnce(officialSlot);
    },
  };
}
