/** Section 7 — EPA fuel economy: MPG bars + CO2 chip; degrades quietly. */

import type { FuelEconomy, SectionResult } from '../lib/types';
import { el, formatNumber } from './dom';
import { mpgBars } from './viz';

export function renderFuel(result: SectionResult<FuelEconomy>): HTMLElement {
  if (result.status !== 'hit' || !result.data) {
    return el(
      'p',
      { class: 'note' },
      result.note ?? 'EPA fuel-economy figures could not be matched to this VIN.',
    );
  }

  const fuel = result.data;
  const bars = mpgBars(fuel);
  const chips = el(
    'div',
    { class: 'fuel-chips' },
    fuel.co2GramsPerMile !== null
      ? el(
          'span',
          { class: 'badge badge--neutral' },
          `${formatNumber(fuel.co2GramsPerMile)} g CO₂/mi`,
        )
      : null,
    fuel.fuelType ? el('span', { class: 'badge badge--neutral' }, fuel.fuelType) : null,
  );

  const metaParts = [
    fuel.matchedName ? `EPA vehicle: ${fuel.matchedName}` : null,
    fuel.matchQuality === 'approximate' ? 'closest match, not exact' : null,
  ].filter((part): part is string => Boolean(part));

  return el(
    'div',
    {},
    bars ??
      el(
        'p',
        { class: 'note' },
        'EPA publishes no MPG figures for this vehicle.',
      ),
    chips.childElementCount > 0 ? chips : null,
    metaParts.length > 0
      ? el('p', { class: 'fuel-meta' }, metaParts.join(' · '))
      : null,
  );
}
