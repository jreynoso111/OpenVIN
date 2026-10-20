/**
 * Pivots: every identifier on screen (VIN, plate, USDOT, MC) is a link that
 * opens its own file. main.ts intercepts clicks on [data-pivot] for SPA
 * navigation; the href keeps open-in-new-tab and copy-link working.
 */

import { queryHref, type QueryKind, type SearchQuery } from '../lib/query';
import { el } from './dom';

const KIND_LABEL: Readonly<Record<QueryKind, string>> = {
  vin: 'VIN',
  plate: 'Plate',
  dot: 'USDOT',
  mc: 'MC',
  name: 'Name',
};

export function pivot(
  query: SearchQuery,
  options: { readonly label?: string; readonly showKind?: boolean; readonly current?: boolean } = {},
): HTMLElement {
  const text =
    options.label ??
    (query.kind === 'plate' && query.state ? query.value + '\u00a0' + query.state : query.value);
  if (options.current) {
    return el('span', { class: 'pivot pivot--current', title: 'This file' }, text);
  }
  return el(
    'a',
    {
      class: 'pivot',
      href: queryHref(query),
      'data-pivot': '',
      title: 'Open the ' + KIND_LABEL[query.kind] + ' file',
    },
    options.showKind ? el('span', { class: 'pivot__kind' }, KIND_LABEL[query.kind]) : null,
    el('span', { class: 'pivot__value' }, text),
  );
}

export const vinPivot = (vin: string, current = false): HTMLElement =>
  pivot({ kind: 'vin', value: vin, state: null }, { current });

export const platePivot = (plate: string, state: string | null, current = false): HTMLElement =>
  pivot({ kind: 'plate', value: plate, state }, { current });

export const dotPivot = (dot: string, label?: string): HTMLElement =>
  pivot({ kind: 'dot', value: dot, state: null }, { label: label ?? 'USDOT ' + dot });

export function saferSnapshotUrl(dot: string | null): string | null {
  if (!dot || !/^\d+$/.test(dot)) return null;
  const params = new URLSearchParams({
    query_param: 'USDOT',
    query_string: dot,
    query_type: 'queryCarrierSnapshot',
    searchtype: 'ANY',
  });
  return 'https://safer.fmcsa.dot.gov/query.asp?' + params.toString();
}

export function externalLink(href: string, label: string, className = 'ext'): HTMLElement {
  return el('a', { class: className, href, target: '_blank', rel: 'noopener noreferrer' }, label, ' ↗');
}
