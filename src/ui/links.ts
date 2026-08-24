/** Guided link-out cards: official records (NMVTIS/NICB) + records elsewhere. */

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
  options: { readonly hero?: boolean } = {},
): HTMLElement {
  return el(
    'a',
    {
      class: `card card--interactive link-card${options.hero ? ' link-card--hero' : ''}`,
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

/** Section 2 — the two highest-value official free checks, prominent. */
export function renderOfficialRecords(links: readonly GuidedLink[]): HTMLElement {
  const official = links.filter((link) => OFFICIAL_KINDS.includes(link.kind));
  const grid = el('div', { class: 'link-grid' });
  for (const link of official) grid.append(guidedLinkCard(link, { hero: true }));
  return el(
    'div',
    {},
    el(
      'p',
      { class: 'note', style: 'margin-bottom:1rem' },
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
  { kind: 'state-title', title: 'State title & lien records' },
  { kind: 'sticker', title: 'Window sticker (original build sheet)' },
  { kind: 'auction', title: 'Auction & salvage photo history' },
  { kind: 'service', title: 'Dealer & owner service portals' },
];

/** Section 9 — remaining guided links grouped by kind. */
export function renderRecordsElsewhere(
  links: readonly GuidedLink[],
): HTMLElement {
  const wrap = el('div', {});
  for (const group of ELSEWHERE_GROUPS) {
    const groupLinks = links.filter((link) => link.kind === group.kind);
    if (groupLinks.length === 0) continue;
    const grid = el('div', { class: 'link-grid' });
    for (const link of groupLinks) grid.append(guidedLinkCard(link));
    wrap.append(
      el(
        'div',
        { class: 'link-group' },
        el('h3', { class: 'link-group__title' }, group.title),
        grid,
      ),
    );
  }
  if (wrap.childElementCount === 0) {
    wrap.append(
      el('p', { class: 'note' }, 'No additional record sources for this vehicle.'),
    );
  }
  return wrap;
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
