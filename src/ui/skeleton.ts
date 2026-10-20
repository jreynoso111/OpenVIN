/** Loading placeholders — shimmering blocks shaped like the real content. */

import { el } from './dom';

function block(heightRem: number, widthPercent: number): HTMLElement {
  return el('div', {
    class: 'skeleton',
    style: `height:${heightRem}rem;width:${widthPercent}%`,
    'aria-hidden': 'true',
  });
}

/** Compact headline + meta line shape (identity header). */
export function identitySkeleton(): HTMLElement {
  return el(
    'div',
    { class: 'skeleton-stack' },
    block(1.8, 46),
    block(0.9, 72),
  );
}

/** A pair of tall cards (guided links). */
export function cardsSkeleton(count: number): HTMLElement {
  const wrap = el('div', { class: 'link-grid', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i += 1) wrap.append(block(6, 100));
  return wrap;
}

/** Headline number + rows (recalls, complaints). */
export function rowsSkeleton(rows: number): HTMLElement {
  const stack = el('div', { class: 'skeleton-stack' }, block(2.2, 30));
  for (let i = 0; i < rows; i += 1) stack.append(block(2.6, 100));
  return stack;
}

/** A few text lines (fuel, warranty, safety). */
export function linesSkeleton(lines: number): HTMLElement {
  const widths = [88, 100, 72, 94, 60];
  const stack = el('div', { class: 'skeleton-stack' });
  for (let i = 0; i < lines; i += 1) {
    stack.append(block(1.4, widths[i % widths.length] ?? 80));
  }
  return stack;
}

/** Chart-shaped block (odometer). */
export function chartSkeleton(): HTMLElement {
  return el(
    'div',
    { class: 'skeleton-stack' },
    block(11, 100),
    block(1.2, 45),
  );
}
