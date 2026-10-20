/** VIN file header body: decoded specs as one compact fact row. */

import type { SectionResult, VehicleIdentity } from '../lib/types';
import { el, formatNumber } from './dom';
import { factList } from './panel';

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
    engine.cylinders !== null ? `${engine.cylinders}-cyl` : null,
    engine.horsepower !== null ? `${formatNumber(engine.horsepower)} hp` : null,
    engine.fuelType,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' ') : null;
}

function plantSummary(identity: VehicleIdentity): string | null {
  const parts = [identity.plant.city, identity.plant.state, identity.plant.country]
    .filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function renderIdentity(
  result: SectionResult<VehicleIdentity>,
): { content: HTMLElement; vehicleName: string | null } {
  if (result.status !== 'hit' || !result.data) {
    return {
      content: el(
        'p',
        { class: 'case__note' },
        result.note ?? 'The federal decoder returned nothing usable. Roadside records below still match the exact VIN.',
      ),
      vehicleName: null,
    };
  }

  const identity = result.data;
  const name = vehicleDisplayName(identity);
  const content = el(
    'div',
    {},
    factList(
      [
        ['Type', [identity.bodyClass ?? identity.vehicleType, identity.series].filter(Boolean).join(' · ') || null],
        ['Engine', engineSummary(identity)],
        ['Drive', [identity.driveType, identity.transmission].filter(Boolean).join(' · ') || null],
        ['GVWR', identity.gvwr],
        ['Built', plantSummary(identity)],
      ],
      'facts facts--row',
    ),
    identity.decodeWarning
      ? el('p', { class: 'case__note' }, 'Decoder note: ' + identity.decodeWarning)
      : null,
  );
  return { content, vehicleName: name || null };
}
