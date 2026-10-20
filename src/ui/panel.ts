/**
 * Case-file building blocks: titled panels with a loading state, and the
 * "sources checked" ledger that replaces per-section source footers.
 */

import type { SectionStatus, SourceMeta } from '../lib/types';
import { clear, el, formatDateTime, revealOnce } from './dom';

export interface Panel {
  readonly root: HTMLElement;
  fill(content: Node | null): void;
  /** Remove the panel entirely (nothing worth showing). */
  drop(): void;
}

let liveRegion: HTMLElement | null = null;

export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = el('div', { class: 'visually-hidden', 'aria-live': 'polite', role: 'status' });
    document.body.append(liveRegion);
  }
  liveRegion.textContent = message;
}

export function loadingLines(lines = 3): HTMLElement {
  const wrap = el('div', { class: 'loading', 'aria-hidden': 'true' });
  for (let i = 0; i < lines; i += 1) {
    wrap.append(el('span', { class: 'loading__line', style: `width:${92 - i * 17}%` }));
  }
  return wrap;
}

export function createPanel(options: {
  readonly id: string;
  readonly title: string;
  readonly hint?: string;
  readonly lines?: number;
}): Panel {
  const headingId = options.id + '-title';
  const body = el('div', { class: 'panel__body' }, loadingLines(options.lines));
  const root = el(
    'section',
    { class: 'panel', id: options.id, 'aria-labelledby': headingId, 'aria-busy': 'true' },
    el(
      'header',
      { class: 'panel__head' },
      el('h2', { class: 'panel__title', id: headingId, tabindex: '-1' }, options.title),
      options.hint ? el('p', { class: 'panel__hint' }, options.hint) : null,
    ),
    body,
  );
  return {
    root,
    fill(content: Node | null): void {
      clear(body);
      if (content) body.append(content);
      root.removeAttribute('aria-busy');
      revealOnce(body);
      announce(options.title + ' loaded');
    },
    drop(): void {
      root.remove();
    },
  };
}

/* ---------- Sources ledger ---------- */

const STATUS_TEXT: Readonly<Record<SectionStatus, string>> = {
  loading: 'Checking…',
  hit: 'Records found',
  miss: 'Nothing on file',
  unavailable: 'Unavailable',
  guided: 'Manual check',
};

export interface Ledger {
  readonly root: HTMLElement;
  add(key: string, label: string): void;
  set(key: string, status: SectionStatus, source: SourceMeta | null, detail?: string): void;
}

export function createLedger(): Ledger {
  const list = el('ol', { class: 'ledger' });
  const rows = new Map<string, HTMLElement>();
  const root = el(
    'section',
    { class: 'rail-block', 'aria-labelledby': 'ledger-title' },
    el('h2', { class: 'rail-block__title', id: 'ledger-title' }, 'Sources checked'),
    list,
  );
  // Hidden for now: the ledger keeps updating, so unhiding it is one line.
  root.hidden = true;
  return {
    root,
    add(key: string, label: string): void {
      const row = el(
        'li',
        { class: 'ledger__row', 'data-status': 'loading' },
        el('span', { class: 'ledger__mark', 'aria-hidden': 'true' }),
        el('span', { class: 'ledger__name' }, label),
        el('span', { class: 'ledger__status' }, STATUS_TEXT.loading),
      );
      rows.set(key, row);
      list.append(row);
    },
    set(key, status, source, detail): void {
      const row = rows.get(key);
      if (!row) return;
      row.dataset['status'] = status;
      const statusNode = row.querySelector('.ledger__status');
      if (statusNode) statusNode.textContent = detail ?? STATUS_TEXT[status];
      row.querySelector('.ledger__meta')?.remove();
      if (source && (source.url || source.fetchedAt)) {
        row.append(
          el(
            'span',
            { class: 'ledger__meta' },
            source.fetchedAt ? 'Queried ' + formatDateTime(source.fetchedAt) : null,
            source.url && source.fetchedAt ? ' · ' : null,
            source.url
              ? el('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', title: source.name }, 'about the data')
              : null,
          ),
        );
      }
    },
  };
}

/** A label/value grid; rows with null values are skipped. */
export function factList(
  facts: ReadonlyArray<readonly [string, Node | string | null]>,
  className = 'facts',
): HTMLElement | null {
  const rows = facts.filter((fact): fact is readonly [string, Node | string] => fact[1] !== null && fact[1] !== '');
  if (rows.length === 0) return null;
  return el(
    'dl',
    { class: className },
    ...rows.map(([label, value]) => el('div', {}, el('dt', {}, label), el('dd', {}, value))),
  );
}

export function emptyNote(text: string): HTMLElement {
  return el('p', { class: 'empty' }, text);
}
