/** Tiny DOM builders — the only "framework" in OpenVIN. */

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
  const date = new Date(iso);
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
