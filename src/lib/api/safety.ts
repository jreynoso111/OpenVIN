/**
 * NHTSA NCAP safety ratings (Tier 0, CORS: reflects Origin). Two-step:
 * year/make/model → variant list, then VehicleId → ratings detail.
 */

import type { SafetyRating, SectionResult, VehicleIdentity } from '../types';
import { asArray, asRecord, fetchJson, intOrNull, stringOrNull } from './http';

const SAFETY_BASE = 'https://api.nhtsa.gov/SafetyRatings';

const SOURCE = {
  name: 'NHTSA Safety Ratings (NCAP)',
  url: 'https://www.nhtsa.gov/ratings',
} as const;

export interface SafetyVariant {
  vehicleDescription: string;
  vehicleId: number;
}

/** Parse the step-1 variant list, else null on bad shape. */
export function parseVariants(body: unknown): SafetyVariant[] | null {
  const root = asRecord(body);
  if (!root) return null;
  const results = asArray(root['Results']);
  if (!results) return null;
  return results
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null)
    .flatMap((record) => {
      const vehicleId = intOrNull(record['VehicleId']);
      const vehicleDescription = stringOrNull(record['VehicleDescription']);
      return vehicleId !== null && vehicleDescription !== null
        ? [{ vehicleDescription, vehicleId }]
        : [];
    });
}

function driveHints(driveType: string | null): string[] {
  const drive = (driveType ?? '').toUpperCase();
  if (/4WD|4X4|AWD|ALL[- ]WHEEL/.test(drive)) return ['4WD', 'AWD', '4X4'];
  if (/FWD|FRONT/.test(drive)) return ['FWD', '2WD', '2-WD'];
  if (/RWD|REAR/.test(drive)) return ['RWD', '2WD', '2-WD'];
  return [];
}

function bodyHints(bodyClass: string | null): string[] {
  const body = (bodyClass ?? '').toUpperCase();
  if (body.includes('COUPE') || body.includes('CONVERTIBLE')) return ['2-DR', '2 DR'];
  if (body.includes('SEDAN') || body.includes('WAGON')) return ['4-DR', '4 DR'];
  if (body.includes('SUV') || body.includes('UTILITY')) return ['SUV'];
  if (body.includes('PICKUP')) return ['PICKUP', 'PU'];
  if (body.includes('VAN')) return ['VAN'];
  return [];
}

/** Pick the variant whose description best matches drive type/body, else the first. */
export function pickBestVariant(
  variants: readonly SafetyVariant[],
  identity: VehicleIdentity,
): SafetyVariant | null {
  if (variants.length === 0) return null;
  const hintGroups = [driveHints(identity.driveType), bodyHints(identity.bodyClass)];
  const scored = variants.map((variant, index) => {
    const description = variant.vehicleDescription.toUpperCase();
    const score = hintGroups.reduce(
      (acc, hints) => acc + (hints.some((hint) => description.includes(hint)) ? 1 : 0),
      0,
    );
    return { variant, score, index };
  });
  const best = scored.reduce((acc, entry) =>
    entry.score > acc.score ? entry : acc,
  );
  return best.variant;
}

/** Map the step-2 detail record to the shared SafetyRating shape. */
export function mapSafetyDetail(record: Record<string, unknown>): SafetyRating {
  return {
    vehicleDescription: stringOrNull(record['VehicleDescription']) ?? '',
    overallRating: stringOrNull(record['OverallRating']),
    frontCrashRating: stringOrNull(record['OverallFrontCrashRating']),
    sideCrashRating: stringOrNull(record['OverallSideCrashRating']),
    rolloverRating: stringOrNull(record['RolloverRating']),
    complaintsCount: intOrNull(record['ComplaintsCount']),
    recallsCount: intOrNull(record['RecallsCount']),
    investigationCount: intOrNull(record['InvestigationCount']),
    vehiclePicture: stringOrNull(record['VehiclePicture']),
  };
}

/** Extract Results[0] of a step-2 response, else null. */
export function extractSafetyDetail(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const results = asArray(root['Results']);
  if (!results || results.length === 0) return null;
  return asRecord(results[0]);
}

export async function getSafetyRating(
  identity: VehicleIdentity,
): Promise<SectionResult<SafetyRating>> {
  const { make, model, modelYear } = identity;
  const fetchedAt = new Date().toISOString();
  const source = { ...SOURCE, fetchedAt };

  if (make === '' || model === '' || modelYear === null) {
    return {
      status: 'unavailable',
      source,
      note: 'Safety-rating lookup needs the decoded make, model, and model year — the VIN decode did not provide them.',
    };
  }

  const listUrl =
    `${SAFETY_BASE}/modelyear/${modelYear}/make/${encodeURIComponent(make)}` +
    `/model/${encodeURIComponent(model)}`;
  const listFetched = await fetchJson(listUrl);
  if (!listFetched.ok) {
    return { status: 'unavailable', source, note: `Safety-rating lookup failed. ${listFetched.note}` };
  }

  const variants = parseVariants(listFetched.data);
  if (variants === null) {
    return {
      status: 'unavailable',
      source,
      note: 'The NHTSA safety-rating service returned an unexpected response shape.',
    };
  }
  const variant = pickBestVariant(variants, identity);
  if (variant === null) {
    return {
      status: 'miss',
      source,
      note: `NHTSA has no NCAP safety rating entry for the ${modelYear} ${make} ${model}.`,
    };
  }

  const detailFetched = await fetchJson(`${SAFETY_BASE}/VehicleId/${variant.vehicleId}`);
  if (!detailFetched.ok) {
    return { status: 'unavailable', source, note: `Safety-rating detail failed. ${detailFetched.note}` };
  }
  const detail = extractSafetyDetail(detailFetched.data);
  if (!detail) {
    return {
      status: 'miss',
      source,
      note: `NHTSA lists the variant "${variant.vehicleDescription}" but returned no rating details for it.`,
    };
  }

  const note =
    variants.length > 1
      ? `NHTSA rated ${variants.length} variants of this model; showing "${variant.vehicleDescription}".`
      : undefined;
  return { status: 'hit', data: mapSafetyDetail(detail), source, note };
}
