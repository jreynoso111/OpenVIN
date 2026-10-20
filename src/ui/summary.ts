/** VIN file summary: the headline numbers and the review flags, above the detail. */

import { buildFlags, summarize, type Flag } from '../lib/analysis';
import type { PlateLink } from '../lib/report';
import type { CommercialInspection } from '../lib/types';
import { ageLabel, el, formatDate, formatNumber } from './dom';

interface Stat {
  label: string;
  value: string;
  sub: string | null;
  tone?: 'danger' | 'warn';
}

function statTile(stat: Stat): HTMLElement {
  return el(
    'div',
    { class: 'stat', 'data-tone': stat.tone },
    el('dt', {}, stat.label),
    el('dd', { class: 'stat__value' }, stat.value),
    stat.sub ? el('dd', { class: 'stat__sub' }, stat.sub) : null,
  );
}

const TONE_LABEL: Readonly<Record<Flag['tone'], string>> = {
  danger: 'Review',
  warn: 'Check',
  info: 'Note',
};

function flagRow(flag: Flag): HTMLElement {
  return el(
    'li',
    { class: 'flag', 'data-tone': flag.tone },
    el('span', { class: 'flag__tone' }, TONE_LABEL[flag.tone]),
    el('div', { class: 'flag__text' }, el('strong', {}, flag.title), el('span', {}, flag.detail)),
  );
}

/** `plateLinks` is null while the plate cross-check is still running. */
export function renderSummary(
  vin: string,
  records: readonly CommercialInspection[],
  plateLinks: readonly PlateLink[] | null,
  extraFlags: readonly Flag[] = [],
): HTMLElement {
  const links = plateLinks ?? [];
  const summary = summarize(vin, records, links);
  const order: Record<Flag['tone'], number> = { danger: 0, warn: 1, info: 2 };
  const flags = [...buildFlags(vin, records, links), ...extraFlags].sort((a, b) => order[a.tone] - order[b.tone]);
  const age = ageLabel(summary.lastDate);
  const resultNotes = [
    summary.outOfService > 0 ? formatNumber(summary.outOfService) + ' out of service' : null,
    summary.vehicleViolations > 0 ? formatNumber(summary.vehicleViolations) + ' vehicle violations' : null,
    summary.unknownVehicleResults > 0
      ? formatNumber(summary.unknownVehicleResults) + ' unit results unavailable'
      : null,
  ].filter((note): note is string => note !== null);

  const stats: Stat[] = [
    {
      label: 'Last seen',
      value: summary.lastDate ? formatDate(summary.lastDate) : '—',
      sub: age,
    },
    {
      label: 'Inspections',
      value: formatNumber(summary.inspections),
      sub: resultNotes.join(' · ') || 'no vehicle violations',
      tone: summary.outOfService > 0 ? 'danger' : undefined,
    },
    {
      label: 'Carriers',
      value: formatNumber(summary.carriers),
      sub: summary.carriers > 1 ? 'changed hands' : summary.carriers === 1 ? 'one carrier' : null,
      tone: summary.carriers >= 3 ? 'warn' : undefined,
    },
    {
      label: 'Plates',
      value: formatNumber(summary.plates),
      sub: summary.plates > 1 ? 'plate changes' : summary.plates === 1 ? 'one plate' : null,
      tone: summary.plates >= 3 ? 'warn' : undefined,
    },
    {
      label: 'States',
      value: formatNumber(summary.states),
      sub: 'where it was stopped',
    },
    {
      label: 'Linked VINs',
      value: plateLinks === null ? '…' : formatNumber(summary.linkedVins),
      sub: plateLinks === null ? 'checking plates' : summary.linkedVins > 0 ? 'share its plates' : 'none share its plates',
      tone: summary.linkedVins > 0 ? 'warn' : undefined,
    },
  ];

  return el(
    'div',
    { class: 'summary' },
    el('dl', { class: 'stats' }, ...stats.map(statTile)),
    flags.length > 0
      ? el(
          'div',
          { class: 'flags' },
          el('h3', { class: 'flags__title' }, 'Points to review'),
          el('ul', { class: 'flags__list' }, ...flags.map(flagRow)),
          el(
            'p',
            { class: 'flags__foot' },
            'Automatic reading of public roadside records. A flag is a reason to look closer, not a finding about anyone.',
          ),
        )
      : el(
          'p',
          { class: 'flags__clear' },
          plateLinks === null
            ? 'Checking plates for other vehicles…'
            : summary.unknownVehicleResults > 0
              ? 'Some unit-level inspection results could not be attributed to this VIN.'
              : 'Nothing stands out in the public roadside records.',
        ),
  );
}
