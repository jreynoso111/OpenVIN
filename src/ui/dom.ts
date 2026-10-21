/** Tiny DOM builders — the only "framework" in High View. */

type Child = Node | string | null | undefined | false;

export type Attrs = Readonly<
  Record<string, string | number | boolean | EventListener | undefined>
>;

function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (key === 'class') {
      node.setAttribute('class', String(value));
      continue;
    }
    node.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
}

/** Create an HTML element with attributes and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Create an SVG element (correct namespace) with attributes and children. */
export function svgEl(
  tag: string,
  attrs: Attrs = {},
  ...children: readonly Child[]
): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Remove all children from a node. */
export function clear(node: Element): void {
  node.replaceChildren();
}

/**
 * Play the rise-in reveal once, then drop the class so re-displaying the
 * element (e.g. a tab panel) does not replay the animation.
 */
export function revealOnce(node: HTMLElement): void {
  node.classList.add('reveal');
  node.addEventListener(
    'animationend',
    () => node.classList.remove('reveal'),
    { once: true },
  );
}

/** Format an integer with thousands separators; em dash for null. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US');
}

/** Format an ISO-ish date string as "Mar 2019" style; raw string on failure. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Date-only strings parse as UTC midnight; read them as local calendar dates.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format an ISO timestamp for source-query freshness labels. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** "today", "3 days ago", "5 months ago", "2 years ago" from an ISO date. */
export function ageLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 45) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}
