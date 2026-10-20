/** Section 1 — compact identity header: name + one wrapping spec meta line. */

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

/** Space-joined so it reads as one item inside the dot-separated meta line. */
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
  return parts.length > 0 ? parts.join(' ') : null;
}

function plantSummary(identity: VehicleIdentity): string | null {
  const parts = [
    identity.plant.city,
    identity.plant.state,
    identity.plant.country,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function renderIdentity(
  result: SectionResult<VehicleIdentity>,
): { content: HTMLElement; vehicleName: string | null } {
  if (result.status !== 'hit' || !result.data) {
    return {
      content: el(
        'div',
        { class: 'identity-compact' },
        el('p', { class: 'identity__name' }, 'This VIN could not be decoded'),
        el(
          'p',
          { class: 'note', style: 'margin-top:0.4rem' },
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
  const metaParts = [
    engineSummary(identity),
    identity.transmission,
    identity.driveType,
    identity.bodyClass,
    plantSummary(identity),
    identity.gvwr,
  ].filter((part): part is string => Boolean(part && part.trim()));

  const content = el(
    'div',
    { class: 'identity-compact' },
    el(
      'div',
      { class: 'identity__header' },
      el(
        'div',
        {},
        el('p', { class: 'identity__eyebrow' }, 'VEHICLE IDENTIFIED BY VIN'),
        el('p', { class: 'identity__name' }, name || identity.vin),
      ),
      el(
        'div',
        { class: 'identity__vin' },
        el('span', { class: 'identity__vin-label' }, 'VIN'),
        el('code', {}, identity.vin),
      ),
    ),
    subParts.length > 0
      ? el('p', { class: 'identity__sub' }, subParts.join(' · '))
      : null,
    metaParts.length > 0
      ? el('p', { class: 'identity__meta' }, metaParts.join(' · '))
      : null,
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
