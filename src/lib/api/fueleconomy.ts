/**
 * EPA fueleconomy.gov REST (Tier 0, CORS: *). Two-step:
 * options menu (year/make/model) → vehicle detail by id.
 * EPA model names often differ from vPIC ("Civic 4Dr"), so an exact model
 * query falls back to a startsWith/contains match on the model menu.
 */

import type { FuelEconomy, SectionResult, VehicleIdentity } from '../types';
import { asArray, asRecord, fetchJson, floatOrNull, intOrNull, stringOrNull } from './http';

const FE_BASE = 'https://www.fueleconomy.gov/ws/rest/vehicle';
const ACCEPT_JSON = 'application/json';
const DISPLACEMENT_TOLERANCE_L = 0.1;

const SOURCE = {
  name: 'EPA fueleconomy.gov',
  url: 'https://www.fueleconomy.gov/',
} as const;

export interface MenuItem {
  text: string;
  value: string;
}

/**
 * Normalize a fueleconomy menu body. The service returns `null` for no
 * matches, a bare object for one item, and an array for several.
 */
export function parseMenuItems(body: unknown): MenuItem[] {
  const root = asRecord(body);
  if (!root) return [];
  const raw = root['menuItem'];
  const entries = asArray(raw) ?? (asRecord(raw) ? [raw] : []);
  return entries
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null)
    .flatMap((record) => {
      const text = stringOrNull(record['text']);
      const value = stringOrNull(record['value']);
      return text !== null && value !== null ? [{ text, value }] : [];
    });
}

export interface ParsedOption {
  displacementL: number | null;
  cylinders: number | null;
  isAutomatic: boolean | null;
}

/** Parse an option label like "Auto 5-spd, 6 cyl, 3.0 L". */
export function parseOptionText(text: string): ParsedOption {
  const displacement = text.match(/([\d.]+)\s*L/i);
  const cylinders = text.match(/(\d+)\s*cyl/i);
  const isAutomatic = /^auto/i.test(text) ? true : /^man/i.test(text) ? false : null;
  return {
    displacementL: displacement ? Number.parseFloat(displacement[1] ?? '') : null,
    cylinders: cylinders ? Number.parseInt(cylinders[1] ?? '', 10) : null,
    isAutomatic,
  };
}

/** Score how well an EPA option matches the decoded engine/transmission. */
function scoreOption(option: MenuItem, identity: VehicleIdentity): number {
  const parsed = parseOptionText(option.text);
  const { displacementL, cylinders } = identity.engine;
  const wantsAutomatic = identity.transmission === null
    ? null
    : /automatic|cvt/i.test(identity.transmission);
  const displacementMatches =
    parsed.displacementL !== null &&
    displacementL !== null &&
    Math.abs(parsed.displacementL - displacementL) <= DISPLACEMENT_TOLERANCE_L;
  const cylindersMatch =
    parsed.cylinders !== null && cylinders !== null && parsed.cylinders === cylinders;
  const transmissionMatches =
    parsed.isAutomatic !== null && wantsAutomatic !== null && parsed.isAutomatic === wantsAutomatic;
  return (displacementMatches ? 4 : 0) + (cylindersMatch ? 2 : 0) + (transmissionMatches ? 1 : 0);
}

/** Pick the best-scoring option; ties and no-signal fall back to the first. */
export function pickOption(
  options: readonly MenuItem[],
  identity: VehicleIdentity,
): MenuItem | null {
  if (options.length === 0) return null;
  const scored = options.map((option, index) => ({
    option,
    score: scoreOption(option, identity),
    index,
  }));
  return scored.reduce((acc, entry) => (entry.score > acc.score ? entry : acc)).option;
}

/** Find an EPA model name matching the vPIC model (exact → startsWith → contains). */
export function pickModelName(models: readonly MenuItem[], vpicModel: string): string | null {
  const target = vpicModel.trim().toUpperCase();
  if (target === '') return null;
  const exact = models.find((model) => model.value.toUpperCase() === target);
  if (exact) return exact.value;
  const startsWith = models.find((model) => model.value.toUpperCase().startsWith(target));
  if (startsWith) return startsWith.value;
  const contains = models.find(
    (model) =>
      model.value.toUpperCase().includes(target) || target.includes(model.value.toUpperCase()),
  );
  return contains ? contains.value : null;
}

/** Map an EPA vehicle detail record to the shared FuelEconomy shape. */
export function mapFuelEconomyVehicle(
  record: Record<string, unknown>,
  matchedName: string,
  matchQuality: FuelEconomy['matchQuality'],
): FuelEconomy {
  const co2 = floatOrNull(record['co2TailpipeGpm']);
  return {
    city: intOrNull(record['city08']),
    highway: intOrNull(record['highway08']),
    combined: intOrNull(record['comb08']),
    co2GramsPerMile: co2 !== null && co2 > 0 ? Math.round(co2) : null,
    fuelType: stringOrNull(record['fuelType1']) ?? stringOrNull(record['fuelType']),
    matchedName,
    matchQuality,
  };
}

async function fetchOptions(year: number, make: string, model: string): Promise<MenuItem[] | 'error'> {
  const url =
    `${FE_BASE}/menu/options?year=${year}&make=${encodeURIComponent(make)}` +
    `&model=${encodeURIComponent(model)}`;
  const fetched = await fetchJson(url, { accept: ACCEPT_JSON });
  return fetched.ok ? parseMenuItems(fetched.data) : 'error';
}

interface ResolvedOptions {
  options: MenuItem[];
  modelName: string;
}

async function resolveOptions(identity: VehicleIdentity): Promise<ResolvedOptions | null> {
  const { make, model, modelYear } = identity;
  if (modelYear === null) return null;

  const direct = await fetchOptions(modelYear, make, model);
  if (direct !== 'error' && direct.length > 0) return { options: direct, modelName: model };

  const modelsUrl = `${FE_BASE}/menu/model?year=${modelYear}&make=${encodeURIComponent(make)}`;
  const modelsFetched = await fetchJson(modelsUrl, { accept: ACCEPT_JSON });
  if (!modelsFetched.ok) return null;
  const matched = pickModelName(parseMenuItems(modelsFetched.data), model);
  if (matched === null) return null;

  const fallback = await fetchOptions(modelYear, make, matched);
  if (fallback === 'error' || fallback.length === 0) return null;
  return { options: fallback, modelName: matched };
}

export async function getFuelEconomy(
  identity: VehicleIdentity,
): Promise<SectionResult<FuelEconomy>> {
  const { make, model, modelYear } = identity;
  const fetchedAt = new Date().toISOString();
  const source = { ...SOURCE, fetchedAt };

  if (make === '' || model === '' || modelYear === null) {
    return {
      status: 'unavailable',
      source,
      note: 'Fuel-economy lookup needs the decoded make, model, and model year — the VIN decode did not provide them.',
    };
  }

  const resolved = await resolveOptions(identity);
  if (resolved === null) {
    return {
      status: 'miss',
      source,
      note: `EPA fueleconomy.gov has no entry matching the ${modelYear} ${make} ${model} (its model names sometimes differ from the VIN decode).`,
    };
  }

  const option = pickOption(resolved.options, identity);
  if (option === null) {
    return {
      status: 'miss',
      source,
      note: `EPA lists the ${modelYear} ${make} ${resolved.modelName} but no engine variants for it.`,
    };
  }

  const detailFetched = await fetchJson(`${FE_BASE}/${encodeURIComponent(option.value)}`, {
    accept: ACCEPT_JSON,
  });
  if (!detailFetched.ok) {
    return { status: 'unavailable', source, note: `Fuel-economy detail failed. ${detailFetched.note}` };
  }
  const detail = asRecord(detailFetched.data);
  if (!detail) {
    return {
      status: 'unavailable',
      source,
      note: 'EPA fueleconomy.gov returned an unexpected response shape.',
    };
  }

  const matchQuality = resolved.options.length === 1 ? 'exact' : 'approximate';
  const matchedName = `${modelYear} ${make} ${resolved.modelName} (${option.text})`;
  const note =
    matchQuality === 'approximate'
      ? `Matched to "${option.text}" out of ${resolved.options.length} EPA variants using engine size and transmission — treat as an estimate.`
      : undefined;
  return {
    status: 'hit',
    data: mapFuelEconomyVehicle(detail, matchedName, matchQuality),
    source,
    note,
  };
}
