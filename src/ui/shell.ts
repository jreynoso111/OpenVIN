/** Page shell: sticky header, hero/landing, footer. */

import { clear, el, svgEl } from './dom';

export const SAMPLE_VIN = '1HGCM82633A004352';

const GITHUB_URL = 'https://github.com/FrancoisChastel/OpenVIN';

const DISCLAIMER =
  'OpenVIN aggregates publicly available vehicle data. It is not affiliated ' +
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
      'OpenVIN',
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
      el('button', { class: 'btn btn--primary', type: 'submit' }, 'Run report'),
    ),
    error,
  );

  const root = el(
    'section',
    { class: 'hero container', 'aria-labelledby': 'hero-heading' },
    el('h1', { class: 'hero__title', id: 'hero-heading' },
      'Every VIN has a history.'),
    el('p', { class: 'hero__tagline' },
      'OpenVIN assembles a free vehicle history from public data — recalls, ' +
      'federal complaints, safety ratings, and official records. ' +
      'Open source. No signup.'),
    form,
    el(
      'p',
      { class: 'vin-sample' },
      'No VIN handy? ',
      el(
        'button',
        {
          type: 'button',
          onclick: () => {
            input.value = SAMPLE_VIN;
            submit(SAMPLE_VIN);
          },
        },
        `Try a sample: ${SAMPLE_VIN}`,
      ),
    ),
    el(
      'ul',
      { class: 'hero__props' },
      el('li', {}, 'Recalls & complaints, VIN-matched'),
      el('li', {}, 'NCAP safety ratings & odometer records'),
      el('li', {}, 'Guided official title & theft checks'),
    ),
    el(
      'p',
      { class: 'hero__honesty' },
      'Free public data sees federal safety records and some state records. ' +
      'It cannot see private sales or anything never reported — ' +
      'and neither can any paid report.',
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
        el('span', { class: 'brand' }, brandMark(), 'OpenVIN'),
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
