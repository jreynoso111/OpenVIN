/** Section 7 — EPA fuel economy: MPG trio + CO2; degrades quietly. */

import type { FuelEconomy, SectionResult } from '../lib/types';
import { el, formatNumber } from './dom';

function mpg(value: number | null, label: string, combined = false): HTMLElement {
  return el(
    'div',
    { class: `mpg${combined ? ' mpg--combined' : ''}` },
    el('div', { class: 'mpg__num' }, value !== null ? String(value) : '—'),
    el('div', { class: 'mpg__label' }, label),
  );
}

export function renderFuel(result: SectionResult<FuelEconomy>): HTMLElement {
  if (result.status !== 'hit' || !result.data) {
    return el(
      'p',
      { class: 'note' },
      result.note ?? 'EPA fuel-economy figures could not be matched to this VIN.',
    );
  }

  const fuel = result.data;
  const metaParts = [
    fuel.co2GramsPerMile !== null
      ? `${formatNumber(fuel.co2GramsPerMile)} g CO₂/mile`
      : null,
    fuel.fuelType,
    fuel.matchedName ? `EPA vehicle: ${fuel.matchedName}` : null,
    fuel.matchQuality === 'approximate' ? 'closest match, not exact' : null,
  ].filter((part): part is string => Boolean(part));

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'mpg-row' },
      mpg(fuel.city, 'City MPG'),
      mpg(fuel.combined, 'Combined MPG', true),
      mpg(fuel.highway, 'Highway MPG'),
    ),
    metaParts.length > 0
      ? el('p', { class: 'fuel-meta' }, metaParts.join(' · '))
      : null,
  );
}
