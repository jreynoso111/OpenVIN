/** Progressive disclosure: first N items visible, the rest behind a toggle. */

import { el } from './dom';

let expanderSeq = 0;

export interface CollapsedListOptions {
  readonly items: readonly HTMLElement[];
  readonly visibleCount: number;
  /** Class applied to both the visible and the hidden list containers. */
  readonly listClass: string;
  /** Button label while collapsed, e.g. "Show all 12 recalls". */
  readonly expandLabel: string;
  /** Button label while expanded, e.g. "Show fewer recalls". */
  readonly collapseLabel: string;
}

/**
 * Render a list collapsed to its first `visibleCount` items with a
 * ghost-button toggle (aria-expanded + aria-controls) for the rest.
 */
export function collapsedList(options: CollapsedListOptions): HTMLElement {
  const { items, visibleCount, listClass } = options;
  const wrap = el(
    'div',
    { class: 'collapsed-list' },
    el('div', { class: listClass }, ...items.slice(0, visibleCount)),
  );
  if (items.length <= visibleCount) return wrap;

  expanderSeq += 1;
  const moreId = `collapsed-more-${expanderSeq}`;
  const more = el(
    'div',
    { class: `${listClass} collapsed-list__more`, id: moreId, hidden: true },
    ...items.slice(visibleCount),
  );
  const button = el(
    'button',
    {
      class: 'expander-btn',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': moreId,
      onclick: () => {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
          more.hidden = true;
          more.classList.remove('reveal');
          button.setAttribute('aria-expanded', 'false');
          button.textContent = options.expandLabel;
        } else {
          more.hidden = false;
          more.classList.add('reveal');
          button.setAttribute('aria-expanded', 'true');
          button.textContent = options.collapseLabel;
        }
      },
    },
    options.expandLabel,
  );
  wrap.append(more, button);
  return wrap;
}
