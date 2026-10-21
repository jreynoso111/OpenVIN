/** Lazy public VIN enrichment for rows in the plate file. */

import { getNyInspections } from '../lib/api/ny';
import { decodeVin } from '../lib/api/vpic';
import type { OdometerReading, SectionResult, VehicleIdentity } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { factList, loadingLines } from './panel';
import type { Ledger } from './panel';
import { externalLink } from './pivot';

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function unavailable<T>(name: string): SectionResult<T> {
  return { status: 'unavailable', source: { name }, note: 'The lookup could not be completed.' };
}

function identityDetails(result: SectionResult<VehicleIdentity>): HTMLElement {
  const identity = result.data;
  if (!identity || result.status === 'miss' || result.status === 'unavailable') {
    return el('div', {}, el('p', { class: 'note' }, result.note ?? 'NHTSA could not decode this VIN.'), externalLink('https://www.nhtsa.gov/vin-decoder', 'NHTSA VIN decoder'));
  }
  const engine = [
    identity.engine.displacementL === null ? null : identity.engine.displacementL + ' L',
    identity.engine.cylinders === null ? null : identity.engine.cylinders + ' cylinders',
    identity.engine.fuelType,
  ].filter(Boolean).join(' · ') || null;
  return el(
    'div',
    {},
    factList([
      ['Decoded identity', [identity.modelYear, identity.make, identity.model].filter(Boolean).join(' ') || null],
      ['Body', identity.bodyClass],
      ['Vehicle type', identity.vehicleType],
      ['Engine', engine],
      ['Drive', identity.driveType],
      ['GVWR', identity.gvwr],
    ]),
    identity.decodeWarning ? el('p', { class: 'note' }, identity.decodeWarning) : null,
    el('p', { class: 'note' }, 'Manufacturer-reported VIN decode; confirm against the vehicle and its documents.'),
  );
}

function nyDetails(result: SectionResult<OdometerReading[]>): HTMLElement {
  const readings = result.data;
  if (!readings || readings.length === 0) {
    return el(
      'div',
      {},
      el('p', { class: 'note' }, result.note ?? 'No matching NY inspection records.'),
      externalLink('https://data.ny.gov/Transportation/Department-of-Motor-Vehicles-Vehicle-Inspections/vezn-fmmk', 'NY State inspection dataset'),
    );
  }
  const recent = [...readings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return el(
    'div',
    {},
    el(
      'ul',
      { class: 'plate-vehicle-readings' },
      ...recent.map((reading) => el(
        'li',
        {},
        el('time', { datetime: reading.date }, formatDate(reading.date)),
        el('strong', {}, formatNumber(reading.miles) + ' mi'),
        reading.note ? el('span', { class: 'muted' }, reading.note) : null,
      )),
    ),
    el('p', { class: 'note' }, 'NY State inspection records only; no result does not mean the vehicle was never inspected elsewhere.'),
  );
}

export function plateVehicleDetails(
  vin: string,
  ledger: Ledger,
  isCurrent: () => boolean,
): HTMLElement {
  const details = el(
    'details',
    { class: 'plate-vehicle-details' },
    el('summary', {}, 'VIN details'),
  );
  let started = false;
  details.addEventListener('toggle', () => {
    if (!details.open || started) return;
    started = true;
    if (!VIN_PATTERN.test(vin)) {
      details.append(el('p', { class: 'note' }, 'A complete 17-character VIN is needed for the public VIN lookups.'));
      return;
    }

    const vpicKey = 'vpic-' + vin;
    const nyKey = 'ny-' + vin;
    ledger.add(vpicKey, 'VIN decode · NHTSA vPIC · ' + vin);
    ledger.add(nyKey, 'NY inspections · data.ny.gov · ' + vin);
    const body = el('div', { class: 'plate-vehicle-details__body' }, loadingLines(3));
    details.append(body);

    void Promise.all([
      decodeVin(vin).catch(() => unavailable<VehicleIdentity>('NHTSA vPIC')),
      getNyInspections(vin).catch(() => unavailable<OdometerReading[]>('NY State inspections')),
    ]).then(([identity, ny]) => {
      if (!isCurrent() || !details.isConnected) return;
      body.replaceChildren(
        el('h4', {}, 'NHTSA VIN decode'),
        identityDetails(identity),
        el('h4', {}, 'New York inspections'),
        nyDetails(ny),
      );
      ledger.set(vpicKey, identity.status, identity.source, identity.status === 'hit' ? 'Decoded' : undefined);
      ledger.set(nyKey, ny.status, ny.source, ny.status === 'hit' ? formatNumber(ny.data?.length ?? 0) + ' readings' : undefined);
    });
  });
  return details;
}
