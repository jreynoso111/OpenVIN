/**
 * NHTSA vPIC VIN decoder (Tier 0, public domain, CORS: *).
 * https://vpic.nhtsa.dot.gov/api/
 */

import type { SectionResult, VehicleIdentity } from '../types';
import { asArray, asRecord, fetchJson, floatOrNull, intOrNull, stringOrNull } from './http';

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

const SOURCE = {
  name: 'NHTSA vPIC',
  url: 'https://vpic.nhtsa.dot.gov/',
} as const;

function field(record: Record<string, unknown>, key: string): string | null {
  return stringOrNull(record[key]);
}

/** vPIC ErrorText → decodeWarning (null when the decode is clean, code 0). */
export function toDecodeWarning(errorCode: unknown, errorText: unknown): string | null {
  const code = stringOrNull(errorCode);
  const text = stringOrNull(errorText);
  if (code === '0' || text === null || text.startsWith('0 -')) return null;
  return text;
}

function buildTransmission(record: Record<string, unknown>): string | null {
  const style = field(record, 'TransmissionStyle');
  if (style === null) return null;
  const speeds = intOrNull(record['TransmissionSpeeds']);
  return speeds === null ? style : `${style} ${speeds}-spd`;
}

/** Map one flat vPIC DecodeVinValues record to the shared VehicleIdentity. */
export function mapVpicRecord(
  record: Record<string, unknown>,
  vin: string,
): VehicleIdentity {
  return {
    vin,
    modelYear: intOrNull(record['ModelYear']),
    make: field(record, 'Make') ?? '',
    model: field(record, 'Model') ?? '',
    trim: field(record, 'Trim'),
    series: field(record, 'Series'),
    bodyClass: field(record, 'BodyClass'),
    vehicleType: field(record, 'VehicleType'),
    engine: {
      cylinders: intOrNull(record['EngineCylinders']),
      displacementL: floatOrNull(record['DisplacementL']),
      horsepower: floatOrNull(record['EngineHP']),
      fuelType: field(record, 'FuelTypePrimary'),
      configuration: field(record, 'EngineConfiguration'),
    },
    driveType: field(record, 'DriveType'),
    transmission: buildTransmission(record),
    plant: {
      city: field(record, 'PlantCity'),
      state: field(record, 'PlantState'),
      country: field(record, 'PlantCountry'),
    },
    gvwr: field(record, 'GVWR'),
    decodeWarning: toDecodeWarning(record['ErrorCode'], record['ErrorText']),
  };
}

/** Extract Results[0] from a raw vPIC response body, else null. */
export function extractVpicRecord(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const results = asArray(root['Results']);
  if (!results || results.length === 0) return null;
  return asRecord(results[0]);
}

export async function decodeVin(vin: string): Promise<SectionResult<VehicleIdentity>> {
  const url = `${VPIC_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const fetched = await fetchJson(url);
  const fetchedAt = new Date().toISOString();
  const source = { ...SOURCE, fetchedAt };

  if (!fetched.ok) {
    return { status: 'unavailable', source, note: `VIN decode failed. ${fetched.note}` };
  }

  const record = extractVpicRecord(fetched.data);
  if (!record) {
    return {
      status: 'unavailable',
      source,
      note: 'The vPIC decoder returned an unexpected response shape.',
    };
  }

  const identity = mapVpicRecord(record, vin);
  if (identity.make === '') {
    return {
      status: 'miss',
      data: identity,
      source,
      note: 'NHTSA could not identify a manufacturer from this VIN — it may be non-US-market or mistyped.',
    };
  }
  return { status: 'hit', data: identity, source };
}
