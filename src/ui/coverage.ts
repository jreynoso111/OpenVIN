/** Section 10 — the coverage panel. OpenVIN's honesty is the brand. */

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

function gapRow(gap: { readonly name: string; readonly detail: string }): HTMLElement {
  return el(
    'div',
    { class: 'coverage-row coverage-row--gap' },
    el('span', { class: 'dot dot--gap' }),
    el(
      'span',
      { class: 'coverage-row__name' },
      gap.name,
      el('span', { class: 'coverage-row__source' }, gap.detail),
    ),
    el('span', { class: 'coverage-row__status' }, 'Out of reach'),
  );
}

export function createCoveragePanel(
  rows: readonly CoverageRowSpec[],
): CoveragePanel {
  const rowElements = new Map<
    string,
    { dot: HTMLElement; source: HTMLElement; status: HTMLElement }
  >();

  const list = el('div', { class: 'coverage__rows' });
  for (const spec of rows) {
    const dot = el('span', { class: 'dot dot--loading' });
    const source = el('span', { class: 'coverage-row__source' }, ' ');
    const status = el('span', { class: 'coverage-row__status' }, 'Checking…');
    rowElements.set(spec.id, { dot, source, status });
    list.append(
      el(
        'div',
        { class: 'coverage-row' },
        dot,
        el('span', { class: 'coverage-row__name' }, spec.name, source),
        status,
      ),
    );
  }
  for (const gap of STRUCTURAL_GAPS) list.append(gapRow(gap));

  const root = el(
    'section',
    { class: 'section', id: 'coverage', 'aria-labelledby': 'coverage-heading' },
    el(
      'div',
      { class: 'coverage' },
      el('p', { class: 'coverage__kicker' }, 'Coverage'),
      el(
        'h2',
        { class: 'section__title', id: 'coverage-heading' },
        'What this report can — and can’t — see',
      ),
      el(
        'p',
        { class: 'coverage__lede' },
        'Every source this report checked, and the two no free service can ' +
        'reach. No vehicle history — free or paid — sees events that were ' +
        'never reported to any public system.',
      ),
      list,
    ),
  );

  return {
    root,
    setRow(id: string, status: SectionStatus, sourceName: string): void {
      const row = rowElements.get(id);
      if (!row) return;
      const treatment = STATUS_TREATMENT[status];
      row.dot.className = `dot ${treatment.dot}`;
      row.status.textContent = treatment.label;
      row.source.textContent = sourceName;
    },
  };
}
