/**
 * FMCSA pivots beyond the VIN: plate sightings, carrier search by name/DBA,
 * USDOT or MC docket, and a carrier's recently inspected fleet. Every function
 * resolves to a SectionResult; none throws.
 */

import type {
  CarrierFleet,
  CarrierProfile,
  FleetVehicle,
  SectionResult,
  UnitSighting,
} from '../types';
import { asArray, fetchJson } from './http';
import {
  CENSUS_DATASET,
  CENSUS_SELECT,
  CENSUS_SOURCE,
  FMCSA_SOURCE,
  INSPECTION_DATASET,
  INSPECTION_SELECT,
  UNIT_DATASET,
  UNIT_SELECT,
  parseCarrier,
  parseInspection,
  parseUnit,
  socrataUrl,
  soqlString,
  type InspectionRow,
  type UnitRow,
} from './fmcsaShared';
import {
  loadCarriers,
  loadInspections,
  loadVehicleFindingsByUnit,
  loadUnitsForInspections,
  newestFirst,
  toSighting,
} from './fmcsa';

const FLEET_INSPECTION_CAP = 400;
const LATEST_VIN_BATCH_SIZE = 25;
const LATEST_UNIT_ROW_CAP = 5000;
const LATEST_INSPECTION_ID_BATCH_SIZE = 300;

/** Latest dated inspection with a known USDOT, keyed by the exact VIN. */
async function latestInspectionByVin(
  vins: readonly string[],
): Promise<Map<string, { date: string; carrierDotNumber: string }>> {
  const uniqueVins = [...new Set(vins)];
  const inspectionIdsByVin = new Map<string, Set<string>>();
  const incompleteVins = new Set<string>();

  const vinBatches: string[][] = [];
  for (let offset = 0; offset < uniqueVins.length; offset += LATEST_VIN_BATCH_SIZE) {
    vinBatches.push(uniqueVins.slice(offset, offset + LATEST_VIN_BATCH_SIZE));
  }
  await Promise.all(vinBatches.map(async (batch) => {
    const response = await fetchJson(
      socrataUrl(UNIT_DATASET, {
        where: 'insp_unit_vehicle_id_number in (' + batch.map(soqlString).join(',') + ')',
        select: 'inspection_id,insp_unit_vehicle_id_number',
        limit: LATEST_UNIT_ROW_CAP,
      }),
      { timeoutMs: 20_000 },
    );
    const rows = response.ok ? asArray(response.data) : null;
    if (!rows || rows.length >= LATEST_UNIT_ROW_CAP) {
      batch.forEach((vin) => incompleteVins.add(vin));
      return;
    }
    for (const unit of rows.map(parseUnit)) {
      if (!unit?.vin || !batch.includes(unit.vin)) continue;
      const ids = inspectionIdsByVin.get(unit.vin) ?? new Set<string>();
      ids.add(unit.inspectionId);
      inspectionIdsByVin.set(unit.vin, ids);
    }
    for (const vin of batch) {
      if (!inspectionIdsByVin.has(vin)) incompleteVins.add(vin);
    }
  }));

  const vinsByInspectionId = new Map<string, Set<string>>();
  for (const [vin, ids] of inspectionIdsByVin) {
    for (const id of ids) {
      const owners = vinsByInspectionId.get(id) ?? new Set<string>();
      owners.add(vin);
      vinsByInspectionId.set(id, owners);
    }
  }
  const inspectionIds = [...vinsByInspectionId.keys()];
  const inspectionBatches: string[][] = [];
  for (let offset = 0; offset < inspectionIds.length; offset += LATEST_INSPECTION_ID_BATCH_SIZE) {
    inspectionBatches.push(inspectionIds.slice(offset, offset + LATEST_INSPECTION_ID_BATCH_SIZE));
  }
  const inspectionChunks = await Promise.all(inspectionBatches.map((batch) => loadInspections(batch)));
  const inspections = new Map<string, InspectionRow>();
  inspectionChunks.forEach((chunk, index) => {
    const batch = inspectionBatches[index];
    if (!chunk) {
      for (const id of batch) {
        for (const vin of vinsByInspectionId.get(id) ?? []) incompleteVins.add(vin);
      }
      return;
    }
    for (const id of batch) {
      const inspection = chunk.get(id);
      if (!inspection) {
        for (const vin of vinsByInspectionId.get(id) ?? []) incompleteVins.add(vin);
      } else {
        inspections.set(id, inspection);
      }
    }
  });

  const latest = new Map<string, { date: string; carrierDotNumber: string }>();
  for (const [vin, ids] of inspectionIdsByVin) {
    for (const id of ids) {
      const inspection = inspections.get(id);
      if (!inspection?.date || !inspection.dotNumber) {
        incompleteVins.add(vin);
        continue;
      }
      const current = latest.get(vin);
      if (!current || inspection.date > current.date) {
        latest.set(vin, { date: inspection.date, carrierDotNumber: inspection.dotNumber });
      }
    }
  }
  for (const vin of incompleteVins) latest.delete(vin);
  return latest;
}

export interface PlateResult {
  sightings: UnitSighting[];
  carriers: CarrierProfile[];
}

/** Plates are stored without spaces or dashes in the unit file. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

function unavailable<T>(source: { name: string; url?: string }, note: string): SectionResult<T> {
  return { status: 'unavailable', source: { ...source, fetchedAt: new Date().toISOString() }, note };
}

/** Every inspected unit that carried this plate (optionally limited to one issuing state). */
export async function searchByPlate(
  rawPlate: string,
  state: string | null,
): Promise<SectionResult<PlateResult>> {
  const fetchedAt = new Date().toISOString();
  const plate = normalizePlate(rawPlate);
  if (!/^[A-Z0-9]{2,10}$/.test(plate)) {
    return unavailable(FMCSA_SOURCE, 'Plates are 2–10 letters or digits.');
  }
  // A few plates are stored with a space or dash; match the typed form too.
  const forms = [...new Set([plate, rawPlate.trim().toUpperCase().replace(/\s+/g, ' ')])]
    .filter((form) => /^[A-Z0-9 -]{2,12}$/.test(form));
  const clauses = ['insp_unit_license in (' + forms.map(soqlString).join(',') + ')'];
  if (state) clauses.push('insp_unit_license_state=' + soqlString(state.toUpperCase()));
  const response = await fetchJson(
    socrataUrl(UNIT_DATASET, { where: clauses.join(' AND '), select: UNIT_SELECT, limit: 500 }),
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) {
    return unavailable(FMCSA_SOURCE, response.ok ? 'Unexpected FMCSA response.' : response.note);
  }
  const requestedState = state?.toUpperCase() ?? null;
  const units = rows
    .map(parseUnit)
    .filter((unit): unit is UnitRow => unit !== null)
    .filter((unit) => normalizePlate(unit.plate ?? '') === plate)
    .filter((unit) => !requestedState || unit.plateState === requestedState);
  if (units.length === 0) {
    return {
      status: 'miss',
      data: { sightings: [], carriers: [] },
      source: { ...FMCSA_SOURCE, fetchedAt },
      note: 'No roadside inspection recorded this plate in the current FMCSA files.',
    };
  }
  const inspectionIds = [...new Set(units.map((unit) => unit.inspectionId))];
  const [inspections, findingsByUnit] = await Promise.all([
    loadInspections(inspectionIds),
    loadVehicleFindingsByUnit(inspectionIds),
  ]);
  const sightings = units
    .map((unit) => toSighting(
      unit,
      inspections?.get(unit.inspectionId),
      findingsByUnit && unit.unitId
        ? findingsByUnit.get(unit.inspectionId + ':' + unit.unitId) ?? []
        : null,
    ))
    .sort(newestFirst);
  const carriers = await loadCarriers(
    sightings.map((s) => s.carrierDotNumber).filter((dot): dot is string => dot !== null),
  );
  return {
    status: inspections && carriers && findingsByUnit ? 'hit' : 'unavailable',
    data: { sightings, carriers: [...(carriers?.values() ?? [])] },
    source: { ...FMCSA_SOURCE, fetchedAt },
    note:
      inspections && carriers && findingsByUnit
        ? undefined
        : 'Some inspection, vehicle finding, or carrier details could not be joined.',
  };
}

/** Uppercased search tokens, SoQL-safe (letters, digits, & and spaces only). */
export function nameTokens(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9& ]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 5);
}

function rankCarrier(term: string, carrier: CarrierProfile): number {
  const names = [carrier.legalName, carrier.dbaName].filter((n): n is string => Boolean(n));
  let score = carrier.status === 'A' ? 0 : 10;
  if (names.some((name) => name === term)) score -= 6;
  else if (names.some((name) => name.startsWith(term))) score -= 3;
  return score - Math.min(3, Math.log10((carrier.powerUnits ?? 0) + 1));
}

/** Carriers whose legal or DBA name contains every search token. Businesses only. */
export async function searchCarriersByName(
  raw: string,
): Promise<SectionResult<CarrierProfile[]>> {
  const fetchedAt = new Date().toISOString();
  const tokens = nameTokens(raw);
  if (tokens.length === 0) return unavailable(CENSUS_SOURCE, 'Enter at least two letters of a company name.');
  const where = tokens
    .map((token) => {
      const like = soqlString('%' + token + '%');
      return '(upper(legal_name) like ' + like + ' OR upper(dba_name) like ' + like + ')';
    })
    .join(' AND ');
  const response = await fetchJson(
    socrataUrl(CENSUS_DATASET, { where, select: CENSUS_SELECT, limit: 120 }),
    { timeoutMs: 20_000 },
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) return unavailable(CENSUS_SOURCE, response.ok ? 'Unexpected census response.' : response.note);
  const term = tokens.join(' ');
  const carriers = rows
    .map(parseCarrier)
    .filter((carrier): carrier is CarrierProfile => carrier !== null && carrier.isBusiness)
    .sort((a, b) => rankCarrier(term, a) - rankCarrier(term, b))
    .slice(0, 40);
  return {
    status: carriers.length > 0 ? 'hit' : 'miss',
    data: carriers,
    source: { ...CENSUS_SOURCE, fetchedAt },
    note:
      carriers.length > 0
        ? 'Business entities only; individual owner-operators are not listed by name.'
        : 'No business carrier matched every word. Try fewer words, the DBA, or the USDOT number.',
  };
}

/** One carrier by USDOT number, or every carrier holding an MC/MX/FF docket number. */
export async function getCarriersById(
  kind: 'dot' | 'mc',
  rawNumber: string,
): Promise<SectionResult<CarrierProfile[]>> {
  const fetchedAt = new Date().toISOString();
  const number = rawNumber.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!number) return unavailable(CENSUS_SOURCE, 'Enter the number only.');
  const where =
    kind === 'dot' ? 'dot_number=' + number : 'docket1=' + soqlString(number);
  const response = await fetchJson(
    socrataUrl(CENSUS_DATASET, { where, select: CENSUS_SELECT, limit: 20 }),
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) return unavailable(CENSUS_SOURCE, response.ok ? 'Unexpected census response.' : response.note);
  const carriers = rows
    .map(parseCarrier)
    .filter((carrier): carrier is CarrierProfile => carrier !== null);
  return {
    status: carriers.length > 0 ? 'hit' : 'miss',
    data: carriers,
    source: { ...CENSUS_SOURCE, fetchedAt },
    note: carriers.length > 0 ? undefined : 'No carrier holds that ' + (kind === 'dot' ? 'USDOT' : 'docket') + ' number.',
  };
}

/** Group sightings into vehicles and count reporting states. Pure; exported for tests. */
export function summarizeFleet(
  sightings: readonly UnitSighting[],
  inspections: readonly InspectionRow[],
  truncated: boolean,
): CarrierFleet {
  const byVin = new Map<string, FleetVehicle>();
  const inspectionIdsByVin = new Map<string, Set<string>>();
  for (const sighting of [...sightings].sort(newestFirst)) {
    if (!sighting.vin) continue;
    const vehicle = byVin.get(sighting.vin);
    const inspectionIds = inspectionIdsByVin.get(sighting.vin) ?? new Set<string>();
    const isNewInspection = !inspectionIds.has(sighting.inspectionId);
    inspectionIds.add(sighting.inspectionId);
    inspectionIdsByVin.set(sighting.vin, inspectionIds);
    const plate = sighting.plate
      ? sighting.plate + (sighting.plateState ? ' ' + sighting.plateState : '')
      : null;
    if (!vehicle) {
      byVin.set(sighting.vin, {
        vin: sighting.vin,
        make: sighting.make,
        unitType: sighting.unitType,
        plates: plate ? [plate] : [],
        companyUnits: sighting.companyUnit ? [sighting.companyUnit] : [],
        inspectionCount: 1,
        lastSeen: sighting,
        latestInspection: null,
        firstSeenDate: sighting.date,
      });
      continue;
    }
    if (isNewInspection) vehicle.inspectionCount += 1;
    if (plate && !vehicle.plates.includes(plate)) vehicle.plates.push(plate);
    if (sighting.companyUnit && !vehicle.companyUnits.includes(sighting.companyUnit)) {
      vehicle.companyUnits.push(sighting.companyUnit);
    }
    if (sighting.date) vehicle.firstSeenDate = sighting.date;
  }

  const states = new Map<string, { state: string; count: number; lastDate: string | null }>();
  const dates: string[] = [];
  for (const inspection of inspections) {
    if (inspection.date) dates.push(inspection.date);
    if (!inspection.state) continue;
    const entry = states.get(inspection.state) ?? { state: inspection.state, count: 0, lastDate: null };
    entry.count += 1;
    if (inspection.date && (!entry.lastDate || inspection.date > entry.lastDate)) {
      entry.lastDate = inspection.date;
    }
    states.set(inspection.state, entry);
  }
  dates.sort();

  return {
    vehicles: [...byVin.values()].sort((a, b) => newestFirst(a.lastSeen, b.lastSeen)),
    states: [...states.values()].sort((a, b) => b.count - a.count),
    inspectionsScanned: inspections.length,
    truncated,
    newestDate: dates[dates.length - 1] ?? null,
    oldestDate: dates[0] ?? null,
  };
}

/** Vehicles recorded on the carrier's most recent roadside inspections. */
export async function getCarrierFleet(dot: string): Promise<SectionResult<CarrierFleet>> {
  const fetchedAt = new Date().toISOString();
  const number = dot.replace(/\D/g, '');
  const response = await fetchJson(
    socrataUrl(INSPECTION_DATASET, {
      where: 'dot_number=' + soqlString(number),
      select: INSPECTION_SELECT,
      order: 'insp_date DESC',
      limit: FLEET_INSPECTION_CAP,
    }),
    { timeoutMs: 20_000 },
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) return unavailable(FMCSA_SOURCE, response.ok ? 'Unexpected FMCSA response.' : response.note);
  const inspections = rows
    .map(parseInspection)
    .filter((row): row is InspectionRow => row !== null);
  if (inspections.length === 0) {
    return {
      status: 'miss',
      data: summarizeFleet([], [], false),
      source: { ...FMCSA_SOURCE, fetchedAt },
      note: 'No roadside inspections for this USDOT number in the current FMCSA files.',
    };
  }
  const byId = new Map(inspections.map((row) => [row.inspectionId, row]));
  // Socrata caps URL length; query unit rows in chunks of 150 inspection IDs.
  const ids = [...byId.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const unitChunks = await Promise.all(chunks.map((chunk) => loadUnitsForInspections(chunk, 600)));
  const failedChunk = unitChunks.some((chunk) => chunk === null);
  const sightings = unitChunks
    .flatMap((chunk) => chunk ?? [])
    .map((unit) => toSighting(unit, byId.get(unit.inspectionId)));
  const truncated = inspections.length >= FLEET_INSPECTION_CAP;
  const fleet = summarizeFleet(sightings, inspections, truncated);
  const latestByVin = await latestInspectionByVin(fleet.vehicles.map((vehicle) => vehicle.vin));
  fleet.vehicles = fleet.vehicles.map((vehicle) => ({
    ...vehicle,
    latestInspection: latestByVin.get(vehicle.vin) ?? null,
  }));
  const latestLookupIncomplete = fleet.vehicles.some((vehicle) => vehicle.latestInspection === null);
  return {
    status: failedChunk ? 'unavailable' : 'hit',
    data: fleet,
    source: { ...FMCSA_SOURCE, fetchedAt },
    note: failedChunk
      ? 'Some inspected units could not be loaded.'
      : latestLookupIncomplete
        ? 'The latest inspection carrier could not be verified for every VIN.'
        : undefined,
  };
}

/** For each plate seen on a VIN, the other VINs that carried the same plate. */
export async function otherVinsForPlates(
  vin: string,
  plates: ReadonlyArray<{ plate: string; state: string | null }>,
): Promise<Array<{ plate: string; state: string | null; sightings: UnitSighting[] }>> {
  const results = await Promise.all(
    plates.slice(0, 4).map(async ({ plate, state }) => {
      const result = await searchByPlate(plate, state);
      const sightings = (result.data?.sightings ?? []).filter(
        (sighting) => sighting.vin !== null && sighting.vin !== vin.toUpperCase(),
      );
      return { plate, state, sightings };
    }),
  );
  return results.filter((entry) => entry.sightings.length > 0);
}
