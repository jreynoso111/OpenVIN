/** Page shell: header with the search box, landing page, footer. */

import { describeQuery, queryHref, type SearchQuery } from '../lib/query';
import { clear, el } from './dom';
import { createSearchForm, type SearchForm } from './searchForm';

const DISCLAIMER =
  'High View assembles public U.S. DOT, NHTSA and New York State records in your browser. ' +
  'It is not affiliated with any data provider, holds no DMV registration or owner data, and ' +
  'shows historical inspection sites only — never live vehicle location.';

const RECENT_KEY = 'highview.recent';

export const EXAMPLES: ReadonlyArray<{ query: SearchQuery; note: string }> = [
  { query: { kind: 'vin', value: '3AKJHHDR7KSJX1198', state: null }, note: 'Tractor with plate history' },
  { query: { kind: 'plate', value: '80764A', state: 'NV' }, note: 'One plate, three VINs' },
  { query: { kind: 'name', value: 'Werner Enterprises', state: null }, note: 'Company name' },
  { query: { kind: 'dot', value: '53467', state: null }, note: 'Carrier fleet' },
];

function wordmark(onHome: () => void): HTMLElement {
  return el(
    'a',
    {
      class: 'wordmark',
      href: './',
      onclick: (event: Event) => {
        event.preventDefault();
        onHome();
      },
    },
    el('span', { class: 'wordmark__glyph', 'aria-hidden': 'true' }, 'HV'),
    el('span', { class: 'wordmark__text' }, 'High View'),
  );
}

export function readRecent(): SearchQuery[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SearchQuery =>
        typeof item === 'object' && item !== null && typeof (item as SearchQuery).value === 'string' &&
        ['vin', 'plate', 'dot', 'mc', 'name'].includes((item as SearchQuery).kind),
    );
  } catch {
    return [];
  }
}

export function rememberSearch(query: SearchQuery): void {
  try {
    const key = queryHref(query);
    const next = [query, ...readRecent().filter((item) => queryHref(item) !== key)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recent list is a convenience only */
  }
}

export interface Shell {
  readonly main: HTMLElement;
  showLanding(): void;
  showFile(query: SearchQuery): void;
}

export function mountShell(
  app: HTMLElement,
  callbacks: { readonly onHome: () => void; readonly onSearch: (query: SearchQuery) => void },
): Shell {
  const search: SearchForm = createSearchForm(callbacks.onSearch, { compact: true, id: 'top-search' });
  const headerInner = el('div', { class: 'topbar__inner container' }, wordmark(callbacks.onHome), search.root);
  const header = el('header', { class: 'topbar' }, headerInner);
  const main = el('main', { id: 'main' });
  clear(app);
  app.append(header, main, footer());

  return {
    main,
    showLanding(): void {
      header.dataset['mode'] = 'landing';
      search.setValue(null);
      main.replaceChildren(landing(callbacks.onSearch));
    },
    showFile(query: SearchQuery): void {
      header.dataset['mode'] = 'file';
      search.setValue(query);
    },
  };
}

function landing(onSearch: (query: SearchQuery) => void): HTMLElement {
  const form = createSearchForm(onSearch, { id: 'home-search' });
  const recent = readRecent();
  const exampleLink = (query: SearchQuery, note: string): HTMLElement =>
    el(
      'li',
      {},
      el('a', { href: queryHref(query), 'data-pivot': '' }, describeQuery(query)),
      el('span', { class: 'muted' }, ' — ' + note),
    );

  const root = el(
    'div',
    { class: 'home container' },
    el(
      'section',
      { class: 'home__search', 'aria-labelledby': 'home-title' },
      el('h1', { class: 'home__title', id: 'home-title' }, 'Find the truck. Follow every record it touches.'),
      el(
        'p',
        { class: 'home__lede' },
        'Start from a VIN, a plate, a company or DBA name, a USDOT or an MC number. High View pulls the roadside inspections behind it and links each plate, carrier and coupled trailer to its own file.',
      ),
      form.root,
    ),
    el(
      'div',
      { class: 'home__cols' },
      el(
        'section',
        { 'aria-labelledby': 'home-leads' },
        el('h2', { class: 'home__h2', id: 'home-leads' }, 'What each search leads to'),
        el(
          'table',
          { class: 'leads' },
          el(
            'tbody',
            {},
            ...[
              ['VIN', 'Last roadside stops, plates carried, carriers, coupled trailers, NY inspections'],
              ['Plate', 'Every VIN that carried it, carriers behind it, where it was stopped'],
              ['Company / DBA', 'Matching business carriers with base city, fleet size and authority'],
              ['USDOT / MC', 'Census profile, operating states, and the fleet seen at roadside'],
            ].map(([kind, leads]) => el('tr', {}, el('th', { scope: 'row' }, kind ?? ''), el('td', {}, leads ?? ''))),
          ),
        ),
      ),
      el(
        'section',
        { 'aria-labelledby': 'home-try' },
        el('h2', { class: 'home__h2', id: 'home-try' }, recent.length > 0 ? 'Recent' : 'Try one'),
        el(
          'ul',
          { class: 'home__list' },
          ...(recent.length > 0
            ? recent.map((query) => el('li', {}, el('a', { href: queryHref(query), 'data-pivot': '' }, describeQuery(query))))
            : EXAMPLES.map((example) => exampleLink(example.query, example.note))),
        ),
        recent.length > 0
          ? el('p', { class: 'home__more' }, 'Examples: ', ...EXAMPLES.flatMap((example, i) => [i > 0 ? ' · ' : '', el('a', { href: queryHref(example.query), 'data-pivot': '' }, describeQuery(example.query))]))
          : null,
      ),
    ),
    el(
      'p',
      { class: 'home__limits' },
      'Coverage: FMCSA roadside inspections reach back about three years and only include commercial vehicles that were stopped. Individual owner-operators are never shown by name. Title, lien and theft status come from the official checks linked in each VIN file.',
    ),
  );
  queueMicrotask(() => form.focus());
  return root;
}

function footer(): HTMLElement {
  return el(
    'footer',
    { class: 'footer' },
    el('div', { class: 'container' }, el('p', {}, DISCLAIMER)),
  );
}
