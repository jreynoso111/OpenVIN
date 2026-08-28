/** Guided link-outs: official records (NMVTIS/NICB) + records elsewhere. */

import type { GuidedLink, GuidedLinkKind } from '../lib/types';
import { el, svgEl } from './dom';

function arrowIcon(): SVGElement {
  const icon = svgEl('svg', {
    class: 'link-card__arrow',
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    'aria-hidden': 'true',
  });
  icon.append(
    svgEl('path', {
      d: 'M4.5 11.5 L11.5 4.5 M6 4.5 H11.5 V10',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  return icon;
}

export function guidedLinkCard(
  link: GuidedLink,
  options: { readonly hero?: boolean; readonly compact?: boolean } = {},
): HTMLElement {
  const modifiers = `${options.hero ? ' link-card--hero' : ''}${
    options.compact ? ' link-card--compact' : ''
  }`;
  return el(
    'a',
    {
      class: `card card--interactive link-card${modifiers}`,
      href: link.url,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    el(
      'div',
      { class: 'link-card__top' },
      el('span', { class: 'link-card__label' }, link.label),
      link.badge ? el('span', { class: 'badge badge--accent' }, link.badge) : null,
      arrowIcon(),
    ),
    el('p', { class: 'link-card__desc' }, link.description),
  );
}

const OFFICIAL_KINDS: readonly GuidedLinkKind[] = ['nmvtis', 'nicb'];

/** The two official-check action cards as a 2-up grid (shared with Overview). */
export function officialActionGrid(links: readonly GuidedLink[]): HTMLElement {
  const official = links.filter((link) => OFFICIAL_KINDS.includes(link.kind));
  const grid = el('div', { class: 'link-grid' });
  for (const link of official) {
    grid.append(guidedLinkCard(link, { hero: true, compact: true }));
  }
  return grid;
}

/** Official checks — slim horizontal 2-up action row. */
export function renderOfficialRecords(links: readonly GuidedLink[]): HTMLElement {
  const grid = officialActionGrid(links);
  return el(
    'div',
    {},
    el(
      'p',
      { class: 'note note--micro', style: 'margin-bottom:0.75rem' },
      'Two official databases cover title brands, salvage history, and theft ' +
      'records. They only answer per-VIN lookups, so run them yourself — ' +
      'both take under a minute.',
    ),
    grid,
  );
}

const ELSEWHERE_GROUPS: readonly {
  readonly kind: GuidedLinkKind;
  readonly title: string;
}[] = [
  { kind: 'state-title', title: 'State titles & liens' },
  { kind: 'sticker', title: 'Window sticker' },
  { kind: 'auction', title: 'Auctions & salvage' },
  { kind: 'service', title: 'Service records' },
];

/** Compact inline link row (label · badge · ↗ + one-line description). */
export function guidedLinkRow(link: GuidedLink): HTMLElement {
  return el(
    'a',
    {
      class: 'link-row',
      href: link.url,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    el(
      'span',
      { class: 'link-row__main' },
      el('span', { class: 'link-row__label' }, link.label),
      link.badge ? el('span', { class: 'badge badge--accent' }, link.badge) : null,
      arrowIcon(),
    ),
    el('span', { class: 'link-row__desc' }, link.description),
  );
}

/** Records elsewhere — compact grouped link list, two columns on desktop. */
export function renderRecordsElsewhere(
  links: readonly GuidedLink[],
): HTMLElement {
  const cols = el('div', { class: 'elsewhere-cols' });
  for (const group of ELSEWHERE_GROUPS) {
    const groupLinks = links.filter((link) => link.kind === group.kind);
    if (groupLinks.length === 0) continue;
    cols.append(
      el(
        'div',
        { class: 'link-group link-group--compact' },
        el('h3', { class: 'link-group__title' }, group.title),
        el('div', { class: 'link-rows' }, ...groupLinks.map(guidedLinkRow)),
      ),
    );
  }
  if (cols.childElementCount === 0) {
    return el(
      'p',
      { class: 'note' },
      'No additional record sources for this vehicle.',
    );
  }
  return cols;
}

export function findLink(
  links: readonly GuidedLink[],
  kind: GuidedLinkKind,
): GuidedLink | undefined {
  return links.find((link) => link.kind === kind);
}

export function findLinks(
  links: readonly GuidedLink[],
  kind: GuidedLinkKind,
): readonly GuidedLink[] {
  return links.filter((link) => link.kind === kind);
}
