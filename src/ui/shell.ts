/** Page shell: sticky header, hero/landing, footer. */

import { clear, el, svgEl } from './dom';

export const SAMPLE_VIN = '1HGCM82633A004352';

const GITHUB_URL = 'https://github.com/jreynoso111/OpenVIN';

const DISCLAIMER =
  'High View aggregates publicly available vehicle data. It is not affiliated ' +
  'with CARFAX, Inc. or any data provider. No vehicle history source — free ' +
  'or paid — is complete: events never reported to any public system will ' +
  'not appear here or anywhere else. Estimates are labeled as estimates. ' +
  'Always inspect a used vehicle independently before purchase.';

function brandMark(): SVGElement {
  const mark = svgEl('svg', {
    class: 'brand__mark',
    viewBox: '0 0 64 64',
    'aria-hidden': 'true',
    width: 22,
    height: 22,
  });
  mark.append(
    svgEl('rect', { width: 64, height: 64, rx: 18, fill: 'var(--color-accent)' }),
    svgEl('path', {
      d: 'M27 46 L37 18 L45 18 L35 46 Z',
      fill: 'var(--color-on-accent)',
      opacity: 0.45,
    }),
    svgEl('path', {
      d: 'M17 33 L28 44 L47 17',
      fill: 'none',
      stroke: 'var(--color-on-accent)',
      'stroke-width': 7,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  return mark;
}

export interface ShellCallbacks {
  readonly onHome: () => void;
  readonly onNewSearch: () => void;
}

export interface Shell {
  readonly main: HTMLElement;
  showLandingHeader(): void;
  showReportHeader(vin: string): void;
  setHeaderVehicle(name: string): void;
}

export function mountShell(app: HTMLElement, callbacks: ShellCallbacks): Shell {
  const headerInner = el('div', { class: 'site-header__inner container' });
  const header = el('header', { class: 'site-header' }, headerInner);
  const main = el('main', {});
  const footer = buildFooter();
  clear(app);
  app.append(header, main, footer);

  const brand = (): HTMLElement =>
    el(
      'a',
      {
        class: 'brand',
        href: './',
        onclick: (event: Event) => {
          event.preventDefault();
          callbacks.onHome();
        },
      },
      brandMark(),
      'High View',
    );

  let vehicleName: HTMLElement | null = null;

  return {
    main,
    showLandingHeader(): void {
      vehicleName = null;
      clear(headerInner);
      headerInner.append(
        brand(),
        el('div', { style: 'margin-left:auto' }),
        el(
          'a',
          {
            class: 'btn btn--ghost',
            href: GITHUB_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'GitHub',
        ),
      );
    },
    showReportHeader(vin: string): void {
      clear(headerInner);
      vehicleName = el('span', { class: 'header-vehicle__name' }, 'Decoding…');
      headerInner.append(
        brand(),
        el(
          'div',
          { class: 'header-vehicle' },
          vehicleName,
          el('span', { class: 'header-vehicle__vin' }, vin),
        ),
        el(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            onclick: () => callbacks.onNewSearch(),
          },
          'New search',
        ),
      );
    },
    setHeaderVehicle(name: string): void {
      if (vehicleName) vehicleName.textContent = name || 'Unknown vehicle';
    },
  };
}

/* ---------- Hero ---------- */

export interface Hero {
  readonly root: HTMLElement;
  showError(message: string): void;
  focus(): void;
}

export function renderHero(onSubmit: (rawVin: string) => void): Hero {
  const input = el('input', {
    class: 'vin-input',
    id: 'vin-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: '17-character VIN',
    'aria-describedby': 'vin-error',
  });
  const error = el('p', {
    class: 'vin-error',
    id: 'vin-error',
    'aria-live': 'polite',
  });

  const submit = (raw: string): void => {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    onSubmit(raw);
  };

  const form = el(
    'form',
    {
      class: 'vin-form',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        submit(input.value);
      },
    },
    el('label', { class: 'visually-hidden', for: 'vin-input' },
      'Vehicle Identification Number'),
    el(
      'div',
      { class: 'vin-form__row' },
      input,
      el('button', { class: 'btn btn--primary', type: 'submit' }, 'Search vehicle'),
    ),
    error,
  );

  const sourceCards = [
    {
      eyebrow: 'FEDERAL',
      title: 'Safety & defect records',
      detail: 'NHTSA recalls, complaints and crash-test ratings.',
    },
    {
      eyebrow: 'STATE',
      title: 'Inspection history',
      detail: 'Public odometer and inspection data where a state publishes it.',
    },
    {
      eyebrow: 'VEHICLE',
      title: 'Specifications',
      detail: 'VIN decode, fuel economy and a labeled warranty estimate.',
    },
    {
      eyebrow: 'OFFICIAL CHECKS',
      title: 'Title & theft sources',
      detail: 'Guided links to official lookups that must be completed on their sites.',
    },
  ];

  const root = el(
    'section',
    { class: 'hero vehicle-search-home container', 'aria-labelledby': 'hero-heading' },
    el(
      'div',
      { class: 'hero__search' },
      el('p', { class: 'hero__eyebrow' }, 'HIGH VIEW · VEHICLE RECORDS'),
      el('h1', { class: 'hero__title', id: 'hero-heading' },
        'Search a VIN. Review the evidence.'),
      el('p', { class: 'hero__tagline' },
        'Build a vehicle-focused file from federal safety sources, available state data and guided official lookups.'),
      form,
      el(
        'p',
        { class: 'vin-sample' },
        'Preview an example: ',
        el(
          'button',
          {
            type: 'button',
            onclick: () => {
              input.value = SAMPLE_VIN;
              submit(SAMPLE_VIN);
            },
          },
          `2003 Honda Accord · ${SAMPLE_VIN}`,
        ),
      ),
      el(
        'p',
        { class: 'hero__honesty' },
        'A missing record means that source returned no match; it does not prove an event never happened. High View does not provide owner profiles or live vehicle location.',
      ),
    ),
    el(
      'section',
      { class: 'hero__sources', 'aria-labelledby': 'sources-heading' },
      el('p', { class: 'hero__sources-kicker' }, 'SEARCH SCOPE'),
      el('h2', { class: 'hero__sources-heading', id: 'sources-heading' },
        'One vehicle file, organized by source'),
      el(
        'div',
        { class: 'hero__source-grid' },
        ...sourceCards.map((card) =>
          el(
            'article',
            { class: 'hero-source card' },
            el('p', { class: 'hero-source__eyebrow' }, card.eyebrow),
            el('h3', { class: 'hero-source__title' }, card.title),
            el('p', { class: 'hero-source__detail' }, card.detail),
          ),
        ),
      ),
    ),
  );

  return {
    root,
    showError(message: string): void {
      error.textContent = message;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    },
    focus(): void {
      input.focus();
    },
  };
}

/* ---------- Footer ---------- */

function buildFooter(): HTMLElement {
  return el(
    'footer',
    { class: 'site-footer' },
    el(
      'div',
      { class: 'container' },
      el(
        'div',
        { class: 'site-footer__row' },
        el('span', { class: 'brand' }, brandMark(), 'High View'),
        el(
          'a',
          { href: GITHUB_URL, target: '_blank', rel: 'noopener noreferrer' },
          'GitHub',
        ),
        el('span', {}, 'MIT License'),
      ),
      el('p', { class: 'site-footer__disclaimer' }, DISCLAIMER),
    ),
  );
}
