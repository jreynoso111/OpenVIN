/** The one search box: mode switch, free text, optional plate state. */

import { parseSearch, US_STATES, type SearchMode, type SearchQuery } from '../lib/query';
import { el } from './dom';

const MODES: ReadonlyArray<{ mode: SearchMode; label: string; placeholder: string }> = [
  { mode: 'auto', label: 'Any', placeholder: 'VIN, plate, company, DBA, USDOT or MC' },
  { mode: 'vin', label: 'VIN', placeholder: '17-character VIN' },
  { mode: 'plate', label: 'Plate', placeholder: 'Plate number, e.g. 80764A' },
  { mode: 'carrier', label: 'Company', placeholder: 'Legal name, DBA, USDOT or MC number' },
];

export interface SearchForm {
  readonly root: HTMLElement;
  setValue(query: SearchQuery | null): void;
  focus(): void;
}

export function createSearchForm(
  onSearch: (query: SearchQuery) => void,
  options: { readonly compact?: boolean; readonly id: string },
): SearchForm {
  let mode: SearchMode = 'auto';
  const inputId = options.id + '-input';
  const errorId = options.id + '-error';
  const input = el('input', {
    class: 'search__input',
    id: inputId,
    type: 'search',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    enterkeyhint: 'search',
    placeholder: MODES[0]?.placeholder ?? '',
    'aria-describedby': errorId,
  });
  const state = el(
    'select',
    { class: 'search__state', 'aria-label': 'Plate state', hidden: true },
    el('option', { value: '' }, 'Any state'),
    ...US_STATES.map((code) => el('option', { value: code }, code)),
  );
  const error = el('p', { class: 'search__error', id: errorId, 'aria-live': 'polite' });

  const buttons = MODES.map((entry) =>
    el(
      'button',
      {
        type: 'button',
        class: 'search__mode',
        'aria-pressed': entry.mode === mode ? 'true' : 'false',
        onclick: () => setMode(entry.mode),
      },
      entry.label,
    ),
  );

  function setMode(next: SearchMode): void {
    mode = next;
    MODES.forEach((entry, index) => buttons[index]?.setAttribute('aria-pressed', entry.mode === next ? 'true' : 'false'));
    input.placeholder = MODES.find((entry) => entry.mode === next)?.placeholder ?? '';
    state.hidden = next !== 'plate';
    input.focus();
  }

  const form = el(
    'form',
    {
      class: 'search' + (options.compact ? ' search--compact' : ''),
      role: 'search',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        const result = parseSearch(input.value, mode, state.value || null);
        if (!result.ok) {
          error.textContent = result.error;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        error.textContent = '';
        input.removeAttribute('aria-invalid');
        onSearch(result.query);
      },
    },
    el('div', { class: 'search__modes', role: 'group', 'aria-label': 'Search by' }, ...buttons),
    el(
      'div',
      { class: 'search__row' },
      el('label', { class: 'visually-hidden', for: inputId }, 'Search'),
      input,
      state,
      el('button', { class: 'search__go', type: 'submit' }, 'Search'),
    ),
    error,
  );

  return {
    root: form,
    setValue(query: SearchQuery | null): void {
      error.textContent = '';
      if (!query) {
        input.value = '';
        setModeQuiet('auto');
        return;
      }
      input.value = query.kind === 'dot' ? 'USDOT ' + query.value : query.kind === 'mc' ? 'MC ' + query.value : query.value;
      setModeQuiet(query.kind === 'vin' ? 'vin' : query.kind === 'plate' ? 'plate' : 'carrier');
      state.value = query.kind === 'plate' && query.state ? query.state : '';
    },
    focus(): void {
      input.focus({ preventScroll: true });
    },
  };

  function setModeQuiet(next: SearchMode): void {
    mode = next;
    MODES.forEach((entry, index) => buttons[index]?.setAttribute('aria-pressed', entry.mode === next ? 'true' : 'false'));
    input.placeholder = MODES.find((entry) => entry.mode === next)?.placeholder ?? '';
    state.hidden = next !== 'plate';
  }
}
