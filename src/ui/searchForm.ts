/** One free-text search box that identifies the query type automatically. */

import { parseSearch, type SearchQuery } from '../lib/query';
import { el } from './dom';

const PLACEHOLDER = 'VIN, plate + state, company, USDOT or MC';

export interface SearchForm {
  readonly root: HTMLElement;
  setValue(query: SearchQuery | null): void;
  focus(): void;
}

export function createSearchForm(
  onSearch: (query: SearchQuery) => void,
  options: { readonly compact?: boolean; readonly id: string },
): SearchForm {
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
    placeholder: PLACEHOLDER,
    'aria-describedby': errorId,
  });
  const error = el('p', { class: 'search__error', id: errorId, 'aria-live': 'polite' });

  const form = el(
    'form',
    {
      class: 'search' + (options.compact ? ' search--compact' : ''),
      role: 'search',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        const result = parseSearch(input.value, 'auto');
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
    el(
      'div',
      { class: 'search__row' },
      el('label', { class: 'visually-hidden', for: inputId }, 'Search'),
      input,
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
        return;
      }
      if (query.kind === 'dot') input.value = 'USDOT ' + query.value;
      else if (query.kind === 'mc') input.value = 'MC ' + query.value;
      else if (query.kind === 'plate' && query.state) input.value = query.value + ' ' + query.state;
      else input.value = query.value;
    },
    focus(): void {
      input.focus({ preventScroll: true });
    },
  };
}
