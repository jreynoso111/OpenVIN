/**
 * Report orchestration: decode first, fan out dependent lookups.
 * Every promise here ALWAYS resolves — failures become SectionResults with
 * status 'unavailable' and a human note, never rejections.
 */

import type {
  ComplaintsSummary,
  FuelEconomy,
  GuidedLink,
  OdometerReading,
  RecallCampaign,
  SafetyRating,
  SectionResult,
  VehicleIdentity,
  WarrantyEstimate,
} from './types';
import { normalizeVin } from './vin';
import { decodeVin } from './api/vpic';
import { getRecalls } from './api/recalls';
import { getComplaints } from './api/complaints';
import { getSafetyRating } from './api/safety';
import { getNyInspections } from './api/ny';
import { getFuelEconomy } from './api/fueleconomy';
import { estimateWarranty } from './warranty';
import { buildGuidedLinks } from './links';

export interface ReportHandle {
  identity: Promise<SectionResult<VehicleIdentity>>;
  recalls: Promise<SectionResult<RecallCampaign[]>>;
  complaints: Promise<SectionResult<ComplaintsSummary>>;
  safety: Promise<SectionResult<SafetyRating>>;
  nyInspections: Promise<SectionResult<OdometerReading[]>>;
  fuelEconomy: Promise<SectionResult<FuelEconomy>>;
  warranty: Promise<SectionResult<WarrantyEstimate>>;
  guidedLinks: Promise<GuidedLink[]>;
}

const DECODE_FAILED_NOTE =
  'The VIN could not be decoded into a vehicle identity, so this lookup could not run.';

function unavailable<T>(sourceName: string, note: string): SectionResult<T> {
  return { status: 'unavailable', source: { name: sourceName }, note };
}

/** Latest odometer reading from an ascending-sorted NY result, else null. */
function latestMiles(ny: SectionResult<OdometerReading[]>): number | null {
  const readings = ny.data;
  if (!readings || readings.length === 0) return null;
  return readings[readings.length - 1]?.miles ?? null;
}

export function startReport(vin: string): ReportHandle {
  const normalized = normalizeVin(vin);

  const identity = decodeVin(normalized).catch(() =>
    unavailable<VehicleIdentity>('NHTSA vPIC', 'The VIN decode failed unexpectedly.'),
  );

  const withIdentity = <T>(
    sourceName: string,
    run: (decoded: VehicleIdentity) => Promise<SectionResult<T>>,
  ): Promise<SectionResult<T>> =>
    identity.then((result) =>
      result.data
        ? run(result.data).catch(() =>
            unavailable<T>(sourceName, 'This lookup failed unexpectedly.'),
          )
        : unavailable<T>(sourceName, DECODE_FAILED_NOTE),
    );

  const nyInspections = getNyInspections(normalized).catch(() =>
    unavailable<OdometerReading[]>(
      'NY State inspections (data.ny.gov)',
      'The NY inspection lookup failed unexpectedly.',
    ),
  );

  const warranty = Promise.all([identity, nyInspections]).then(
    ([decoded, ny]): SectionResult<WarrantyEstimate> => {
      if (!decoded.data) {
        return unavailable<WarrantyEstimate>('High View estimate', DECODE_FAILED_NOTE);
      }
      try {
        return estimateWarranty(decoded.data, latestMiles(ny));
      } catch {
        return unavailable<WarrantyEstimate>(
          'High View estimate',
          'The warranty estimate failed unexpectedly.',
        );
      }
    },
  );

  const guidedLinks = identity
    .then((result) => buildGuidedLinks(normalized, result.data ?? null))
    .catch(() => buildGuidedLinks(normalized, null));

  return {
    identity,
    recalls: withIdentity('NHTSA Recalls', (decoded) => getRecalls(decoded)),
    complaints: withIdentity('NHTSA Complaints (ODI)', (decoded) =>
      getComplaints(decoded, normalized),
    ),
    safety: withIdentity('NHTSA Safety Ratings (NCAP)', (decoded) => getSafetyRating(decoded)),
    nyInspections,
    fuelEconomy: withIdentity('EPA fueleconomy.gov', (decoded) => getFuelEconomy(decoded)),
    warranty,
    guidedLinks,
  };
}
