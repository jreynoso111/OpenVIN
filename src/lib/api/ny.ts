/**
 * New York State vehicle safety/emissions inspections (Socrata open data,
 * Tier 0, CORS: *, no token needed). Odometer readings only cover
 * NY-registered vehicles.
 * Dataset: https://data.ny.gov/resource/vezn-fmmk
 */

import type { OdometerReading, SectionResult } from '../types';
import { asArray, asRecord, fetchJson, intOrNull, stringOrNull } from './http';

const NY_URL = 'https://data.ny.gov/resource/vezn-fmmk.json';
const MAX_ROWS = 200;

const SOURCE = {
  name: 'NY State inspections (data.ny.gov)',
  url: 'https://data.ny.gov/Transportation/Vehicle-Safety-and-Emissions-Inspections/vezn-fmmk',
} as const;

function buildNote(record: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const type = stringOrNull(record['inspection_type']);
  if (type) parts.push(type);
  const safety = stringOrNull(record['safety_inspection_result']);
  if (safety) parts.push(`Safety: ${safety}`);
  const emissions = stringOrNull(record['initial_emission_result']);
  if (emissions) parts.push(`Emissions: ${emissions}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Map one Socrata inspection row to an OdometerReading; null when unusable. */
export function mapInspectionRow(record: Record<string, unknown>): OdometerReading | null {
  const miles = intOrNull(record['odometer_reading']);
  if (miles === null || miles <= 0) return null;
  const rawDate = stringOrNull(record['inspection_date']);
  if (rawDate === null) return null;
  const date = rawDate.slice(0, 10); // "2025-03-13T12:17:50.000" → "2025-03-13"
  return { date, miles, source: 'NY State inspection', note: buildNote(record) };
}

/** Parse rows, drop unusable ones, sort ascending by date, dedupe (date, miles). */
export function parseInspections(body: unknown): OdometerReading[] | null {
  const rows = asArray(body);
  if (!rows) return null;
  const readings = rows
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null)
    .map(mapInspectionRow)
    .filter((reading): reading is OdometerReading => reading !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  return readings.filter((reading) => {
    const key = `${reading.date}|${reading.miles}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getNyInspections(vin: string): Promise<SectionResult<OdometerReading[]>> {
  const fetchedAt = new Date().toISOString();
  const source = { ...SOURCE, fetchedAt };
  const url =
    `${NY_URL}?vin=${encodeURIComponent(vin.toUpperCase())}` +
    `&$order=inspection_date&$limit=${MAX_ROWS}`;

  const fetched = await fetchJson(url);
  if (!fetched.ok) {
    return { status: 'unavailable', source, note: `NY inspection lookup failed. ${fetched.note}` };
  }

  const readings = parseInspections(fetched.data);
  if (readings === null) {
    return {
      status: 'unavailable',
      source,
      note: 'The NY open-data service returned an unexpected response shape.',
    };
  }
  if (readings.length === 0) {
    return {
      status: 'miss',
      source,
      note: 'No New York inspection records — this dataset only covers NY-registered vehicles.',
    };
  }
  return {
    status: 'hit',
    data: readings,
    source,
    note: `${readings.length} odometer reading(s) from NY State inspections.`,
  };
}
