/**
 * VIN file orchestration: decode, FMCSA roadside history, NY inspections,
 * then a second hop through every plate the vehicle carried.
 * Every promise here ALWAYS resolves — failures become SectionResults with
 * status 'unavailable' and a human note, never rejections.
 */

import type {
  CommercialInspection,
  GuidedLink,
  OdometerReading,
  SectionResult,
  UnitSighting,
  VehicleIdentity,
} from './types';
import { normalizeVin } from './vin';
import { decodeVin } from './api/vpic';
import { getNyInspections } from './api/ny';
import { getCommercialInspections } from './api/fmcsa';
import { otherVinsForPlates } from './api/fmcsaLookup';
import { buildGuidedLinks } from './links';

/** Another VIN that carried a plate this vehicle was also seen with. */
export interface PlateLink {
  plate: string;
  state: string | null;
  sightings: UnitSighting[];
}

export interface ReportHandle {
  identity: Promise<SectionResult<VehicleIdentity>>;
  nyInspections: Promise<SectionResult<OdometerReading[]>>;
  commercialInspections: Promise<SectionResult<CommercialInspection[]>>;
  /** Second hop: other vehicles recorded under this vehicle's plates. */
  plateLinks: Promise<PlateLink[]>;
  guidedLinks: Promise<GuidedLink[]>;
}

/** Distinct plate/state pairs, most recently observed first. Pure; exported for tests. */
export function distinctPlates(
  records: readonly CommercialInspection[],
): Array<{ plate: string; state: string | null }> {
  const seen = new Set<string>();
  const plates: Array<{ plate: string; state: string | null }> = [];
  for (const record of records) {
    if (!record.plate) continue;
    const key = record.plate + '|' + (record.plateState ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    plates.push({ plate: record.plate, state: record.plateState });
  }
  return plates;
}

function unavailable<T>(sourceName: string, note: string): SectionResult<T> {
  return { status: 'unavailable', source: { name: sourceName }, note };
}

export function startReport(vin: string): ReportHandle {
  const normalized = normalizeVin(vin);

  const identity = decodeVin(normalized).catch(() =>
    unavailable<VehicleIdentity>('NHTSA vPIC', 'The VIN decode failed unexpectedly.'),
  );

  const nyInspections = getNyInspections(normalized).catch(() =>
    unavailable<OdometerReading[]>(
      'NY State inspections (data.ny.gov)',
      'The NY inspection lookup failed unexpectedly.',
    ),
  );

  const commercialInspections = getCommercialInspections(normalized).catch(() =>
    unavailable<CommercialInspection[]>(
      'FMCSA roadside inspections (U.S. DOT Open Data)',
      'The FMCSA vehicle-inspection lookup failed unexpectedly.',
    ),
  );

  const plateLinks = commercialInspections
    .then((result) => otherVinsForPlates(normalized, distinctPlates(result.data ?? [])))
    .catch(() => []);

  const guidedLinks = identity
    .then((result) => buildGuidedLinks(normalized, result.data ?? null))
    .catch(() => buildGuidedLinks(normalized, null));

  return {
    identity,
    nyInspections,
    commercialInspections,
    plateLinks,
    guidedLinks,
  };
}
