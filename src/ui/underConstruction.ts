/// <reference types="vite/client" />

import { createBrandMark } from './brand';
import { el } from './dom';

const BASE_URL = import.meta.env.BASE_URL;

export function mountUnderConstruction(root: HTMLElement): void {
  const brand = el(
    'a',
    { class: 'construction__brand', href: BASE_URL, 'aria-label': 'VinOrbits home' },
    createBrandMark(),
    el('span', { class: 'construction__brand-name' }, 'VinOrbits'),
  );

  const header = el(
    'header',
    { class: 'construction__header' },
    brand,
    el('span', { class: 'construction__header-note' }, 'VEHICLE INTELLIGENCE · IN ORBIT'),
  );

  const hero = el(
    'section',
    { class: 'construction__hero', 'aria-labelledby': 'construction-title' },
    el('img', {
      class: 'construction__art',
      src: `${BASE_URL}vinorbits-under-construction.png`,
      alt: 'A recovery truck and passenger car on an orbital road, surrounded by vehicle files and inspection markers.',
      fetchpriority: 'high',
    }),
    el('div', { class: 'construction__overlay', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'construction__content' },
      el(
        'p',
        { class: 'construction__status', role: 'status' },
        el('span', { class: 'construction__status-dot', 'aria-hidden': 'true' }),
        'UNDER CONSTRUCTION',
      ),
      el('p', { class: 'construction__eyebrow' }, 'VEHICLE RESEARCH, REIMAGINED'),
      el('h1', { id: 'construction-title' }, 'A clearer view of every vehicle’s story.'),
      el(
        'p',
        { class: 'construction__lede' },
        'VinOrbits is taking shape: a new way to follow the public records behind VINs, plates, and carriers.',
      ),
      el(
        'ul',
        { class: 'construction__signals', 'aria-label': 'What VinOrbits brings together' },
        el('li', {}, 'VIN signals'),
        el('li', {}, 'Road history'),
        el('li', {}, 'Carrier records'),
      ),
      el('p', { class: 'construction__footnote' }, 'Our next route is coming into view.'),
    ),
  );

  const footer = el(
    'footer',
    { class: 'construction__footer' },
    el('span', {}, 'VINORBITS'),
    el('span', { class: 'construction__footer-copy' }, 'Built for a clearer view of the road ahead.'),
  );

  root.replaceChildren(el('div', { class: 'construction' }, header, el('main', {}, hero), footer));
}
