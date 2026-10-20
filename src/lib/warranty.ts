/**
 * Factory-warranty remaining-coverage estimator. Pure — no I/O.
 * All output is an estimate: the real in-service date (first sale) is not
 * public data, so we assume September 1 of the year before the model year.
 */

import type { SectionResult, VehicleIdentity, WarrantyCoverageRow, WarrantyEstimate } from './types';
import { WARRANTY_TERMS, type WarrantyTerm } from './data/warrantyTerms';

const ASSUMED_IN_SERVICE_MONTH_INDEX = 8; // September

const SOURCE = {
  name: 'High View estimate (published factory warranty terms)',
} as const;

function assumedInServiceDate(modelYear: number): { iso: string; year: number } {
  const year = modelYear - 1;
  return { iso: `${year}-09-01`, year };
}

function monthsSince(inServiceYear: number, now: Date): number {
  const elapsed =
    (now.getFullYear() - inServiceYear) * 12 +
    (now.getMonth() - ASSUMED_IN_SERVICE_MONTH_INDEX);
  return Math.max(0, elapsed);
}

function joinNotes(...notes: (string | undefined)[]): string | undefined {
  const joined = notes.filter((note): note is string => note !== undefined).join(' ');
  return joined === '' ? undefined : joined;
}

/** Compute one coverage row. Warranty ends at whichever limit is hit first. */
export function estimateCoverageRow(
  term: WarrantyTerm,
  elapsedMonths: number,
  latestOdometerMiles: number | null,
): WarrantyCoverageRow {
  const monthsRemaining = term.termMonths - elapsedMonths;
  const hasMileCap = Number.isFinite(term.termMiles);
  const milesRemaining =
    latestOdometerMiles !== null && hasMileCap ? term.termMiles - latestOdometerMiles : null;
  const expiredByTime = monthsRemaining <= 0;
  const expiredByMiles = milesRemaining !== null && milesRemaining <= 0;
  const expired = expiredByTime || expiredByMiles;

  return {
    coverage: term.coverage,
    termMonths: term.termMonths,
    termMiles: term.termMiles,
    estRemainingMonths: expired ? null : monthsRemaining,
    estRemainingMiles: expired || milesRemaining === null ? null : milesRemaining,
    note: joinNotes(
      term.note,
      expired
        ? expiredByTime
          ? 'Likely expired (time limit reached).'
          : 'Likely expired (mileage limit exceeded).'
        : undefined,
    ),
  };
}

export function estimateWarranty(
  identity: VehicleIdentity,
  latestOdometerMiles: number | null,
  now: Date = new Date(),
): SectionResult<WarrantyEstimate> {
  const brandKey = identity.make.trim().toLowerCase();
  const terms = WARRANTY_TERMS[brandKey];
  if (!terms) {
    return {
      status: 'miss',
      source: SOURCE,
      note: `No factory warranty table for ${identity.make || 'this make'} — check the owner's manual or a dealer for coverage terms.`,
    };
  }
  if (identity.modelYear === null) {
    return {
      status: 'miss',
      source: SOURCE,
      note: 'The VIN decode did not include a model year, so warranty coverage cannot be estimated.',
    };
  }

  const inService = assumedInServiceDate(identity.modelYear);
  const elapsedMonths = monthsSince(inService.year, now);
  const rows = terms.map((term) => estimateCoverageRow(term, elapsedMonths, latestOdometerMiles));

  const mileageNote =
    latestOdometerMiles !== null
      ? `Mileage remaining uses the newest odometer reading found (${latestOdometerMiles.toLocaleString('en-US')} miles).`
      : 'No odometer reading was found, so only time-based estimates are shown.';
  return {
    status: 'hit',
    data: {
      assumedInServiceDate: inService.iso,
      assumptionNote:
        `Estimates assume the vehicle entered service on ${inService.iso} ` +
        `(September 1 of the year before the ${identity.modelYear} model year) — actual in-service dates vary by months. ` +
        `${mileageNote} Standard published terms only; actual coverage depends on the real in-service date, ownership transfers, and exclusions.`,
      rows,
    },
    source: SOURCE,
    note: 'Estimate only — a dealer can confirm exact coverage from the VIN.',
  };
}
