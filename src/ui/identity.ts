/** Section 1 — vehicle identity: name headline + spec grid. */

import type { SectionResult, VehicleIdentity } from '../lib/types';
import { el, formatNumber } from './dom';

export function vehicleDisplayName(identity: VehicleIdentity): string {
  const parts = [
    identity.modelYear !== null ? String(identity.modelYear) : null,
    identity.make,
    identity.model,
    identity.trim,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.join(' ');
}

function engineSummary(identity: VehicleIdentity): string | null {
  const { engine } = identity;
  const parts = [
    engine.displacementL !== null ? `${engine.displacementL.toFixed(1)}L` : null,
    engine.configuration && engine.cylinders !== null
      ? `${engine.configuration.charAt(0).toUpperCase()}${engine.cylinders}`
      : engine.cylinders !== null
        ? `${engine.cylinders}-cyl`
        : null,
    engine.horsepower !== null ? `${formatNumber(engine.horsepower)} hp` : null,
    engine.fuelType,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function plantSummary(identity: VehicleIdentity): string | null {
  const parts = [
    identity.plant.city,
    identity.plant.state,
    identity.plant.country,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

function spec(label: string, value: string | null): HTMLElement | null {
  if (!value) return null;
  return el(
    'div',
    { class: 'spec' },
    el('div', { class: 'spec__label' }, label),
    el('div', { class: 'spec__value' }, value),
  );
}

export function renderIdentity(
  result: SectionResult<VehicleIdentity>,
): { content: HTMLElement; vehicleName: string | null } {
  if (result.status !== 'hit' || !result.data) {
    return {
      content: el(
        'div',
        { class: 'card' },
        el('p', { class: 'identity__name' }, 'This VIN could not be decoded'),
        el(
          'p',
          { class: 'note', style: 'margin-top:0.5rem' },
          result.note ??
            'The federal VIN decoder did not return a usable result. ' +
            'The rest of the report may still find records.',
        ),
      ),
      vehicleName: null,
    };
  }

  const identity = result.data;
  const name = vehicleDisplayName(identity);
  const subParts = [identity.series, identity.vehicleType].filter(
    (part): part is string => Boolean(part && part.trim()),
  );

  const grid = el('div', { class: 'spec-grid' });
  const specs = [
    spec('Engine', engineSummary(identity)),
    spec('Drive', identity.driveType),
    spec('Transmission', identity.transmission),
    spec('Body', identity.bodyClass),
    spec('Assembly plant', plantSummary(identity)),
    spec('GVWR', identity.gvwr),
  ];
  for (const item of specs) {
    if (item) grid.append(item);
  }

  const content = el(
    'div',
    { class: 'card' },
    el('p', { class: 'identity__name' }, name || identity.vin),
    subParts.length > 0
      ? el('p', { class: 'identity__sub' }, subParts.join(' · '))
      : null,
    grid,
    identity.decodeWarning
      ? el(
          'p',
          { class: 'decode-warning' },
          `Decoder note: ${identity.decodeWarning}`,
        )
      : null,
  );

  return { content, vehicleName: name || null };
}
