import { createBrandMark } from './brand';
import { el } from './dom';

const BASE_URL = import.meta.env.BASE_URL;

export function mountMaintenancePage(root: HTMLElement): void {
  const brand = el(
    'a',
    { class: 'maintenance__brand', href: BASE_URL, 'aria-label': 'VinOrbits home' },
    createBrandMark(),
    el('span', { class: 'maintenance__brand-name' }, 'VinOrbits'),
  );

  const header = el(
    'header',
    { class: 'maintenance__header' },
    brand,
    el(
      'span',
      { class: 'maintenance__header-status' },
      el('span', { class: 'maintenance__status-dot', 'aria-hidden': 'true' }),
      'Maintenance in progress',
    ),
  );

  const illustration = el('img', {
    class: 'maintenance__illustration',
    src: `${BASE_URL}maintenance-illustration.svg`,
    alt: '',
    fetchpriority: 'high',
  });

  const main = el(
    'main',
    { class: 'maintenance__main' },
    el(
      'section',
      { class: 'maintenance__message', 'aria-labelledby': 'maintenance-title' },
      el(
        'p',
        { class: 'maintenance__eyebrow' },
        el('span', { class: 'maintenance__status-dot', 'aria-hidden': 'true' }),
        'WE’RE MAKING A FEW IMPROVEMENTS',
      ),
      el('h1', { id: 'maintenance-title' }, 'We’ll be back soon.'),
      el(
        'p',
        { class: 'maintenance__copy' },
        'VinOrbits is temporarily unavailable while we carry out maintenance. Please check back shortly.',
      ),
      el('p', { class: 'maintenance__thanks' }, 'Thank you for your patience.'),
    ),
    el('div', { class: 'maintenance__art-panel', 'aria-hidden': 'true' }, illustration),
  );

  const footer = el(
    'footer',
    { class: 'maintenance__footer' },
    el('span', {}, '© 2026 VINORBITS'),
    el('span', {}, 'We appreciate your patience while we work.'),
  );

  root.replaceChildren(el('div', { class: 'maintenance' }, header, main, footer));
}
