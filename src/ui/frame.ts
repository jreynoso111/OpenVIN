/** Shared section chrome: title, status pill, source footer, reveal motion. */

import type { SectionStatus, SourceMeta } from '../lib/types';
import { clear, el } from './dom';

export interface SectionMeta {
  readonly status: SectionStatus;
  readonly source: SourceMeta;
  readonly note?: string;
}

export interface SectionFrame {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  /** Swap the skeleton for real content + status pill + source footer. */
  hydrate(meta: SectionMeta, content: Node | null): void;
}

const STATUS_LABELS: Readonly<Partial<Record<SectionStatus, string>>> = {
  miss: 'No records found',
  unavailable: 'Source unavailable',
  guided: 'Manual check',
};

let liveRegion: HTMLElement | null = null;

/** Politely announce section arrivals to assistive tech. */
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = el('div', {
      class: 'visually-hidden',
      'aria-live': 'polite',
      role: 'status',
    });
    document.body.append(liveRegion);
  }
  liveRegion.textContent = message;
}

function sourceFooter(meta: SectionMeta): HTMLElement {
  const { source, note } = meta;
  const sourceName = source.url
    ? el(
        'a',
        { href: source.url, target: '_blank', rel: 'noopener noreferrer' },
        source.name,
      )
    : document.createTextNode(source.name);
  return el(
    'p',
    { class: 'section__source' },
    'Source: ',
    sourceName,
    note ? ` · ${note}` : null,
  );
}

export interface SectionOptions {
  readonly id: string;
  readonly title: string;
  /** Keep the h2 for structure but hide it (identity's headline is the name). */
  readonly hideTitle?: boolean;
  readonly skeleton: Node;
}

export function createSection(options: SectionOptions): SectionFrame {
  const headingId = `${options.id}-heading`;
  const pill = el('span', { class: 'status-pill', hidden: true });
  const heading = el(
    'h2',
    {
      class: options.hideTitle ? 'visually-hidden' : 'section__title',
      id: headingId,
    },
    options.title,
  );
  const head = options.hideTitle
    ? el('div', {}, heading)
    : el('div', { class: 'section__head' }, heading, pill);
  const body = el('div', { class: 'section__body' }, options.skeleton);
  const root = el(
    'section',
    { class: 'section', id: options.id, 'aria-labelledby': headingId },
    head,
    body,
  );

  const hydrate = (meta: SectionMeta, content: Node | null): void => {
    clear(body);
    if (content) body.append(content);
    const label = STATUS_LABELS[meta.status];
    if (label && !options.hideTitle) {
      pill.textContent = label;
      pill.classList.toggle('status-pill--unavailable', meta.status === 'unavailable');
      pill.hidden = false;
    }
    body.append(sourceFooter(meta));
    body.classList.add('reveal');
    announce(`${options.title} section loaded`);
  };

  return { root, body, hydrate };
}
