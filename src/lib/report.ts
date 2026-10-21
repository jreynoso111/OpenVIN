/**
 * VIN file orchestration: decode, FMCSA roadside history, NY inspections,
 * then a second hop through every plate the vehicle carried.
 * Every promise here ALWAYS resolves — failures become SectionResults with
 * status 'unavailable' and a human note, never rejections.
 */

import type {
  CommercialInspection,
  ComplaintsSummary,
  GuidedLink,
  NyRegistration,
  OdometerReading,
  RecallCampaign,
  SafetyRating,
  SectionResult,
  UnitSighting,
  VehicleIdentity,
} from './types';
import { normalizeVin } from './vin';
import { decodeVin } from './api/vpic';
import { getNyInspections, getNyRegistration } from './api/ny';
import { getCommercialInspections } from './api/fmcsa';
import { getRecalls } from './api/recalls';
import { getComplaints } from './api/complaints';
import { getSafetyRating } from './api/safety';
import { getNhtsaOdiVehicleLine, nhtsaOdiMirrorEnabled, type NhtsaOdiLookup } from './api/nhtsaOdi';
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
  nyRegistration: Promise<SectionResult<NyRegistration[]>>;
  commercialInspections: Promise<SectionResult<CommercialInspection[]>>;
  /** NHTSA campaigns and complaints for the decoded year/make/model line. */
  recalls: Promise<SectionResult<RecallCampaign[]>>;
  complaints: Promise<SectionResult<ComplaintsSummary>>;
  /** NHTSA NCAP ratings and model-line investigation count, not a VIN finding. */
  safety: Promise<SectionResult<SafetyRating>>;
  /** Local Ubuntu mirror; exact model-line records, not a VIN finding. */
  nhtsaOdi?: Promise<SectionResult<NhtsaOdiLookup>>;
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

  const nyRegistration = getNyRegistration(normalized).catch(() =>
    unavailable<NyRegistration[]>(
      'NY State registrations (data.ny.gov)',
      'The NY registration lookup failed unexpectedly.',
    ),
  );

  const commercialInspections = getCommercialInspections(normalized).catch(() =>
    unavailable<CommercialInspection[]>(
      'FMCSA roadside inspections (U.S. DOT Open Data)',
      'The FMCSA vehicle-inspection lookup failed unexpectedly.',
    ),
  );

  const recalls = identity
    .then((decoded) =>
      decoded.data
        ? getRecalls(decoded.data)
        : unavailable<RecallCampaign[]>('NHTSA Recalls', 'Recalls need the decoded make, model and year.'),
    )
    .catch(() => unavailable<RecallCampaign[]>('NHTSA Recalls', 'The recall lookup failed unexpectedly.'));

  const complaints = identity
    .then((decoded) =>
      decoded.data
        ? getComplaints(decoded.data, normalized)
        : unavailable<ComplaintsSummary>('NHTSA Complaints (ODI)', 'Complaints need the decoded make, model and year.'),
    )
    .catch(() => unavailable<ComplaintsSummary>('NHTSA Complaints (ODI)', 'The complaint lookup failed unexpectedly.'));

  const safety = identity
    .then((decoded) =>
      decoded.data
        ? getSafetyRating(decoded.data)
        : unavailable<SafetyRating>('NHTSA Safety Ratings', 'Safety data needs a decoded year, make and model.'),
    )
    .catch(() => unavailable<SafetyRating>('NHTSA Safety Ratings', 'The safety lookup failed unexpectedly.'));

  const nhtsaOdi = nhtsaOdiMirrorEnabled()
    ? identity
        .then((decoded) =>
          decoded.data
            ? getNhtsaOdiVehicleLine(decoded.data)
            : unavailable<NhtsaOdiLookup>(
                'NHTSA ODI public data mirror',
                'The ODI lookup needs the decoded model year, make, and model.',
              ),
        )
        .catch(() => unavailable<NhtsaOdiLookup>('NHTSA ODI public data mirror', 'The ODI lookup failed unexpectedly.'))
    : undefined;

  const plateLinks = commercialInspections
    .then((result) => otherVinsForPlates(normalized, distinctPlates(result.data ?? [])))
    .catch(() => []);

  const guidedLinks = identity
    .then((result) => buildGuidedLinks(normalized, result.data ?? null))
    .catch(() => buildGuidedLinks(normalized, null));

  return {
    identity,
    nyInspections,
    nyRegistration,
    commercialInspections,
    recalls,
    complaints,
    safety,
    nhtsaOdi,
    plateLinks,
    guidedLinks,
  };
}
