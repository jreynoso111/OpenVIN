/** Page shell: sticky header, hero/landing, footer. */

import { clear, el, svgEl } from './dom';

export const SAMPLE_VIN = '1HGCM82633A004352';

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
      d: 'M15 17 H23 V28 H41 V17 H49 V47 H41 V35 H23 V47 H15 Z',
      fill: 'var(--color-on-accent)',
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
        el('span', { class: 'header-product-tag' }, 'FLEET INTELLIGENCE'),
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
          'Search another VIN',
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
      eyebrow: '01 · FEDERAL',
      title: 'Safety & recall signals',
      detail: 'NHTSA campaigns, ODI complaints and crash-test data, with VIN-match limits called out.',
    },
    {
      eyebrow: '02 · STATE',
      title: 'Inspection & mileage',
      detail: 'New York’s public inspection dataset is connected. Other state checks remain official link-outs.',
    },
    {
      eyebrow: '03 · FLEET',
      title: 'Vektor TMS status',
      detail: 'Not connected yet. Dispatch status and last-known fleet location are not available in High View.',
    },
    {
      eyebrow: '04 · VERIFICATION',
      title: 'Title & theft checks',
      detail: 'Open official or authorized portals. Their results stay on those sites and are not imported.',
    },
  ];

  const root = el(
    'section',
    { class: 'hero vehicle-search-home container', 'aria-labelledby': 'hero-heading' },
    el(
      'div',
      { class: 'hero__search' },
      el('p', { class: 'hero__eyebrow' }, 'HIGH VIEW · VEHICLE RECOVERY DESK'),
      el('h1', { class: 'hero__title', id: 'hero-heading' },
        'One VIN. The latest activity, at a glance.'),
      el('p', { class: 'hero__tagline' },
        'A vehicle file organized for fleet and recovery work: identity first, newest dated records next, and every source labeled.'),
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
        'A missing record in one feed does not rule out records elsewhere. Public VIN data does not reveal an owner or a vehicle’s live location; Vektor TMS is not connected yet.',
      ),
    ),
    el(
      'section',
      { class: 'hero__sources', 'aria-labelledby': 'sources-heading' },
      el('p', { class: 'hero__sources-kicker' }, 'HOW THE FILE IS BUILT'),
      el('h2', { class: 'hero__sources-heading', id: 'sources-heading' },
        'One vehicle file, organized for action'),
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
        el('span', { class: 'footer-workspace-tag' }, 'Fleet & recovery workspace'),
        el('span', {}, 'Public records · Federal + available state data'),
      ),
      el('p', { class: 'site-footer__disclaimer' }, DISCLAIMER),
    ),
  );
}
