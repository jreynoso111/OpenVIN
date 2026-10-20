/** Case-file chrome shared by VIN, plate, carrier and name searches. */

import type { GuidedLink, GuidedLinkKind } from '../lib/types';
import { el } from './dom';

export interface CaseHeader {
  readonly root: HTMLElement;
  setTitle(title: string): void;
  setBody(content: Node | null): void;
  setIdentifiers(content: Node | null): void;
}

/** Copy-link and save-as-PDF (the browser's print dialog) for the open file. */
function caseActions(): HTMLElement {
  const copy = el(
    'button',
    {
      class: 'copy',
      type: 'button',
      title: 'Copy a link to this file',
      onclick: (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          button.textContent = 'Link copied';
          setTimeout(() => (button.textContent = 'Copy link'), 1400);
        });
      },
    },
    'Copy link',
  );
  const print = el(
    'button',
    {
      class: 'copy',
      type: 'button',
      title: 'Open the print dialog and choose “Save as PDF”',
      onclick: () => window.print(),
    },
    'Save PDF',
  );
  return el('span', { class: 'case__actions' }, copy, print);
}

export function caseHeader(kind: string, identifier: string, title = 'Searching…'): CaseHeader {
  const heading = el('h1', { class: 'case__title', tabindex: '-1' }, title);
  const body = el('div', { class: 'case__body' });
  const ids = el('div', { class: 'case__ids' });
  const root = el(
    'header',
    { class: 'case' },
    el(
      'p',
      { class: 'case__kind' },
      el('span', {}, kind),
      el('code', { class: 'case__id' }, identifier),
      el(
        'button',
        {
          class: 'copy',
          type: 'button',
          title: 'Copy ' + identifier,
          onclick: (event: Event) => {
            const button = event.currentTarget as HTMLButtonElement;
            void navigator.clipboard?.writeText(identifier).then(() => {
              button.textContent = 'Copied';
              setTimeout(() => (button.textContent = 'Copy'), 1400);
            });
          },
        },
        'Copy',
      ),
    ),
    heading,
    body,
    ids,
  );
  root.querySelector('.case__kind')?.append(caseActions());
  return {
    root,
    setTitle(text: string): void {
      heading.textContent = text;
    },
    setBody(content: Node | null): void {
      body.replaceChildren(...(content ? [content] : []));
    },
    setIdentifiers(content: Node | null): void {
      ids.replaceChildren(...(content ? [content] : []));
    },
  };
}

export function caseLayout(
  header: HTMLElement,
  mainBlocks: readonly HTMLElement[],
  railBlocks: readonly HTMLElement[],
): HTMLElement {
  return el(
    'div',
    { class: 'desk container' },
    header,
    el(
      'div',
      { class: 'desk__grid' },
      el('div', { class: 'desk__main' }, ...mainBlocks),
      el('aside', { class: 'desk__rail', 'aria-label': 'Sources and follow-up checks' }, ...railBlocks),
    ),
  );
}

const CHECK_GROUPS: ReadonlyArray<{ kinds: readonly GuidedLinkKind[]; title: string }> = [
  { kinds: ['history'], title: 'Older commercial history' },
  { kinds: ['nicb', 'nmvtis'], title: 'Theft & title brands' },
  { kinds: ['state-title'], title: 'State title & liens' },
  { kinds: ['auction'], title: 'Auction & salvage' },
];

/** Official follow-ups as a plain link list in the rail. */
export function officialChecks(links: readonly GuidedLink[]): HTMLElement {
  const block = el(
    'section',
    { class: 'rail-block', 'aria-labelledby': 'checks-title' },
    el('h2', { class: 'rail-block__title', id: 'checks-title' }, 'Run these yourself'),
    el('p', { class: 'rail-block__note' }, 'Official per-VIN lookups. Results stay on their sites.'),
  );
  for (const group of CHECK_GROUPS) {
    const items = links.filter((link) => group.kinds.includes(link.kind));
    if (items.length === 0) continue;
    const item = (link: GuidedLink): HTMLElement =>
      el(
        'li',
        {},
        el('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, link.label, ' ↗'),
        link.badge ? el('span', { class: 'checks__badge' }, link.badge) : null,
      );
    block.append(
      el('h3', { class: 'rail-block__sub' }, group.title),
      el('ul', { class: 'checks' }, ...items.slice(0, 2).map(item)),
    );
    if (items.length > 2) {
      block.append(
        el(
          'details',
          { class: 'state-more' },
          el('summary', {}, items.length - 2 + ' more'),
          el('ul', { class: 'checks' }, ...items.slice(2).map(item)),
        ),
      );
    }
  }
  return block;
}

/** Single caveat, stated once per file instead of on every section. */
export function limitsNote(text: string): HTMLElement {
  return el(
    'section',
    { class: 'rail-block rail-block--quiet' },
    el('h2', { class: 'rail-block__title' }, 'Read before acting'),
    el('p', { class: 'rail-block__note' }, text),
  );
}
