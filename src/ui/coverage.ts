/** Coverage strip — OpenVIN's honesty, compressed to chips + two gap lines. */

import type { SectionStatus } from '../lib/types';
import { el } from './dom';

export interface CoverageRowSpec {
  readonly id: string;
  readonly name: string;
}

export interface CoveragePanel {
  readonly root: HTMLElement;
  setRow(id: string, status: SectionStatus, sourceName: string): void;
}

const STATUS_TREATMENT: Readonly<
  Record<SectionStatus, { readonly dot: string; readonly label: string }>
> = {
  loading: { dot: 'dot--loading', label: 'Checking…' },
  hit: { dot: 'dot--ok', label: 'Records found' },
  miss: { dot: 'dot--none', label: 'None found' },
  unavailable: { dot: 'dot--warn', label: 'Source unavailable' },
  guided: { dot: 'dot--accent', label: 'Manual check' },
};

const STRUCTURAL_GAPS: readonly {
  readonly name: string;
  readonly detail: string;
}[] = [
  {
    name: 'Police accident reports',
    detail: 'No free source exists — open crash data strips VINs',
  },
  {
    name: 'Dealer service records',
    detail: 'Proprietary — use the owner-portal links above',
  },
];

const LEGEND: readonly { readonly dot: string; readonly label: string }[] = [
  { dot: 'dot--ok', label: 'Records found' },
  { dot: 'dot--none', label: 'None found' },
  { dot: 'dot--accent', label: 'Manual check' },
  { dot: 'dot--warn', label: 'Source unavailable' },
];

export function createCoveragePanel(
  rows: readonly CoverageRowSpec[],
): CoveragePanel {
  const chipElements = new Map<
    string,
    { chip: HTMLElement; dot: HTMLElement; sr: HTMLElement }
  >();

  const chips = el('div', { class: 'coverage-chips' });
  for (const spec of rows) {
    const dot = el('span', { class: 'dot dot--loading' });
    const sr = el('span', { class: 'visually-hidden' }, ' — checking');
    const chip = el(
      'span',
      { class: 'coverage-chip' },
      dot,
      el('span', { class: 'coverage-chip__name' }, spec.name),
      sr,
    );
    chipElements.set(spec.id, { chip, dot, sr });
    chips.append(chip);
  }

  const gaps = el(
    'div',
    { class: 'coverage-gaps' },
    ...STRUCTURAL_GAPS.map((gap) =>
      el(
        'p',
        { class: 'coverage-gap' },
        el('span', { class: 'dot dot--gap' }),
        el('span', {}, el('strong', {}, gap.name), ` — ${gap.detail}`),
      ),
    ),
  );

  const legend = el(
    'p',
    { class: 'coverage-legend', 'aria-hidden': 'true' },
    ...LEGEND.map((item) =>
      el(
        'span',
        {},
        el('span', { class: `dot ${item.dot}` }),
        item.label,
      ),
    ),
  );

  const root = el(
    'section',
    { class: 'section', id: 'coverage', 'aria-labelledby': 'coverage-heading' },
    el(
      'div',
      { class: 'coverage' },
      el('p', { class: 'coverage__kicker' }, 'Coverage'),
      el(
        'h2',
        { class: 'section__title', id: 'coverage-heading', tabindex: '-1' },
        'What this report can — and can’t — see',
      ),
      el(
        'p',
        { class: 'coverage__lede' },
        'Every source this report checked, and the two no free service can ' +
        'reach. No vehicle history — free or paid — sees events that were ' +
        'never reported to any public system.',
      ),
      chips,
      gaps,
      legend,
    ),
  );

  return {
    root,
    setRow(id: string, status: SectionStatus, sourceName: string): void {
      const row = chipElements.get(id);
      if (!row) return;
      const treatment = STATUS_TREATMENT[status];
      row.dot.className = `dot ${treatment.dot}`;
      row.sr.textContent = ` — ${treatment.label} — ${sourceName}`;
      row.chip.setAttribute('title', `${treatment.label} · ${sourceName}`);
    },
  };
}
