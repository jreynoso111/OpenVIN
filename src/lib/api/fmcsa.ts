/**
 * Free FMCSA roadside-inspection history matched to an exact VIN.
 * Queries public vehicle, inspection-count, violation and carrier census fields,
 * plus the other units recorded on the same inspections (tractor/trailer pairs).
 * Includes recognized business entity names; excludes individual names, contacts,
 * street addresses, officers and driver data.
 * The datasets are public and require no API key.
 */

import type {
  CarrierProfile,
  CommercialInspection,
  CommercialInspectionViolation,
  SectionResult,
  UnitSighting,
} from '../types';
import { asArray, asRecord, fetchJson } from './http';
import {
  CENSUS_DATASET,
  CENSUS_SELECT,
  FMCSA_SOURCE,
  INSPECTION_DATASET,
  INSPECTION_SELECT,
  UNIT_DATASET,
  UNIT_SELECT,
  VIOLATION_DATASET,
  isOutOfService,
  numericList,
  parseCarrier,
  parseInspection,
  parseUnit,
  quotedList,
  socrataUrl,
  soqlString,
  textField,
  unitTypeLabel,
  type InspectionRow,
  type UnitRow,
} from './fmcsaShared';

const MAX_UNITS = 500;

function parseVehicleViolation(value: unknown): {
  inspectionId: string;
  unitId: string;
  finding: CommercialInspectionViolation;
} | null {
  const row = asRecord(value);
  if (!row) return null;
  const inspectionId = textField(row['inspection_id']);
  const unitId = textField(row['insp_unit_id']);
  const code = textField(row['viol_code']);
  const description = textField(row['viol_desc']);
  if (!inspectionId || !unitId || (!code && !description)) return null;
  return {
    inspectionId,
    unitId,
    finding: {
      code,
      description,
      part: textField(row['part_no']),
      outOfService: isOutOfService(row['out_of_service_indicator']),
    },
  };
}

function failed<T>(note: string, fetchedAt: string): SectionResult<T> {
  return {
    status: 'unavailable',
    source: { ...FMCSA_SOURCE, fetchedAt },
    note,
  };
}

/** Load census profiles for a set of USDOT numbers; null when the call failed. */
export async function loadCarriers(
  dots: readonly string[],
): Promise<Map<string, CarrierProfile> | null> {
  const list = numericList([...new Set(dots)]);
  const map = new Map<string, CarrierProfile>();
  if (!list) return map;
  const response = await fetchJson(
    socrataUrl(CENSUS_DATASET, {
      where: 'dot_number in (' + list + ')',
      select: CENSUS_SELECT,
      limit: 200,
    }),
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) return null;
  for (const row of rows) {
    const carrier = parseCarrier(row);
    if (carrier) map.set(carrier.dotNumber, carrier);
  }
  return map;
}

/** Load inspection-level rows for a set of inspection IDs; null when the call failed. */
export async function loadInspections(
  ids: readonly string[],
): Promise<Map<string, InspectionRow> | null> {
  const map = new Map<string, InspectionRow>();
  const list = numericList(ids);
  if (!list) return map;
  const response = await fetchJson(
    socrataUrl(INSPECTION_DATASET, {
      where: 'inspection_id in (' + list + ')',
      select: INSPECTION_SELECT,
      limit: 1000,
    }),
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) return null;
  for (const row of rows) {
    const inspection = parseInspection(row);
    if (inspection) map.set(inspection.inspectionId, inspection);
  }
  return map;
}

/** All units recorded on a set of inspections; null when the call failed. */
export async function loadUnitsForInspections(
  ids: readonly string[],
  limit = 1500,
): Promise<UnitRow[] | null> {
  const list = quotedList(ids);
  if (!list) return [];
  const response = await fetchJson(
    socrataUrl(UNIT_DATASET, {
      where: 'inspection_id in (' + list + ')',
      select: UNIT_SELECT,
      limit,
    }),
  );
  const rows = response.ok ? asArray(response.data) : null;
  if (!rows) return null;
  return rows.map(parseUnit).filter((unit): unit is UnitRow => unit !== null);
}

export function toSighting(unit: UnitRow, inspection: InspectionRow | undefined): UnitSighting {
  return {
    inspectionId: unit.inspectionId,
    date: inspection?.date ?? null,
    state: inspection?.state ?? null,
    site: inspection?.site ?? null,
    carrierDotNumber: inspection?.dotNumber ?? null,
    vin: unit.vin,
    plate: unit.plate,
    plateState: unit.plateState,
    make: unit.make,
    unitType: unitTypeLabel(unit.typeCode),
    companyUnit: unit.companyUnit,
    position: unit.position,
    vehicleOutOfService: inspection?.vehicleOutOfService ?? null,
  };
}

export function newestFirst<T extends { date: string | null }>(a: T, b: T): number {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.localeCompare(a.date);
}

export async function getCommercialInspections(
  vin: string,
): Promise<SectionResult<CommercialInspection[]>> {
  const fetchedAt = new Date().toISOString();
  const requestedVin = vin.trim().toUpperCase();
  const unitResponse = await fetchJson(
    socrataUrl(UNIT_DATASET, {
      where: 'insp_unit_vehicle_id_number=' + soqlString(requestedVin),
      select: UNIT_SELECT,
      limit: MAX_UNITS,
    }),
  );
  if (!unitResponse.ok) {
    return failed('FMCSA vehicle-unit lookup failed. ' + unitResponse.note, fetchedAt);
  }

  const rawUnits = asArray(unitResponse.data);
  if (!rawUnits) {
    return failed('FMCSA returned an unexpected vehicle-unit response.', fetchedAt);
  }

  const unitMap = new Map<string, UnitRow>();
  for (const unit of rawUnits.map(parseUnit)) {
    // Socrata applies the VIN predicate server-side, but keep the VIN-file
    // boundary here too: roadside rows must never inherit another unit from
    // a shared carrier, plate, or inspection.
    if (!unit || unit.vin !== requestedVin) continue;
    const key = unit.inspectionId + ':' + (unit.unitId ?? unit.plate + '|' + unit.plateState);
    unitMap.set(key, unit);
  }
  const units = [...unitMap.values()];
  if (units.length === 0) {
    return {
      status: 'miss',
      data: [],
      source: { ...FMCSA_SOURCE, fetchedAt },
      note: 'No exact-VIN match in the current FMCSA inspection files (about three years of history).',
    };
  }

  const inspectionIds = [...new Set(units.map((unit) => unit.inspectionId))];
  const [inspectionMap, allUnits, violationResponse] = await Promise.all([
    loadInspections(inspectionIds),
    loadUnitsForInspections(inspectionIds),
    fetchJson(
      socrataUrl(VIOLATION_DATASET, {
        where: 'inspection_id in (' + numericList(inspectionIds) + ')',
        select: 'inspection_id,insp_unit_id,viol_code,viol_desc,part_no,out_of_service_indicator',
        limit: 2000,
      }),
    ),
  ]);

  const violationRows = violationResponse.ok ? asArray(violationResponse.data) : null;
  const findingsByUnit = new Map<string, CommercialInspectionViolation[]>();
  for (const value of violationRows ?? []) {
    const parsed = parseVehicleViolation(value);
    if (!parsed) continue;
    const key = parsed.inspectionId + ':' + parsed.unitId;
    const findings = findingsByUnit.get(key) ?? [];
    findings.push(parsed.finding);
    findingsByUnit.set(key, findings);
  }

  const carrierDots = [...(inspectionMap?.values() ?? [])]
    .map((row) => row.dotNumber)
    .filter((dot): dot is string => dot !== null);
  const carrierMap = await loadCarriers(carrierDots);

  const companionsByInspection = new Map<string, UnitRow[]>();
  for (const unit of allUnits ?? []) {
    if (unit.vin === requestedVin) continue;
    const list = companionsByInspection.get(unit.inspectionId) ?? [];
    list.push(unit);
    companionsByInspection.set(unit.inspectionId, list);
  }

  const records: CommercialInspection[] = units.map((unit) => {
    const inspection = inspectionMap?.get(unit.inspectionId);
    const dot = inspection?.dotNumber ?? null;
    const carrier = dot ? carrierMap?.get(dot) : undefined;
    const unitFindings = unit.unitId
      ? findingsByUnit.get(unit.inspectionId + ':' + unit.unitId) ?? []
      : null;
    return {
      inspectionId: unit.inspectionId,
      date: inspection?.date ?? null,
      state: inspection?.state ?? null,
      location: inspection?.site ?? null,
      level: inspection?.level ?? null,
      carrierDotNumber: dot,
      carrierLegalName: carrier?.legalName ?? null,
      carrierDbaName: carrier?.dbaName ?? null,
      carrierStatusCode: carrier?.status ?? null,
      carrierOperationClass: carrier?.operationClass ?? null,
      carrierTruckUnits: carrier?.truckUnits ?? null,
      carrierPowerUnits: carrier?.powerUnits ?? null,
      carrierRecordableCrashRate: carrier?.recordableCrashRate ?? null,
      carrierMcs150Date: carrier?.mcs150Date ?? null,
      carrierDocketPrefix: carrier?.docketPrefix ?? null,
      carrierDocketNumber: carrier?.docketNumber ?? null,
      carrierAuthorityStatusCode: carrier?.authorityStatus ?? null,
      carrierSafetyRating: carrier?.safetyRating ?? null,
      carrierSafetyRatingDate: carrier?.safetyRatingDate ?? null,
      carrierBaseCity: carrier?.baseCity ?? null,
      carrierBaseState: carrier?.baseState ?? null,
      plate: unit.plate,
      plateState: unit.plateState,
      vehicleMake: unit.make,
      vehicleTypeCode: unit.typeCode,
      companyUnit: unit.companyUnit,
      companions: (companionsByInspection.get(unit.inspectionId) ?? [])
        .map((companion) => toSighting(companion, inspection))
        .sort((a, b) => (a.position ?? 9) - (b.position ?? 9)),
      inspectionViolations: inspection?.violations ?? null,
      inspectionOutOfService: inspection?.outOfService ?? null,
      // The inspection dataset's vehicle totals cover the entire inspection.
      // Use the citation rows joined to this exact unit ID instead, or leave
      // the unit result unknown when that join is unavailable.
      vehicleViolations: violationRows && unitFindings ? unitFindings.length : null,
      vehicleOutOfService:
        violationRows && unitFindings
          ? unitFindings.some((finding) => finding.outOfService) ? 1 : 0
          : null,
      vehicleFindings: (unitFindings ?? []).sort((a, b) => {
        if (a.outOfService !== b.outOfService) return a.outOfService ? -1 : 1;
        return (a.code ?? '').localeCompare(b.code ?? '');
      }),
    };
  });

  records.sort(newestFirst);

  const notes: string[] = [];
  if (!inspectionMap) {
    notes.push('Inspection dates, sites and carrier joins could not be loaded.');
  } else if (inspectionMap.size < inspectionIds.length) {
    notes.push('Some inspection details did not join to the VIN rows.');
  }
  if (!violationRows) notes.push('Unit-level violation descriptions are temporarily unavailable.');
  if (!allUnits) notes.push('Units inspected together could not be loaded.');
  if (carrierDots.length > 0 && !carrierMap) {
    notes.push('Carrier census enrichment was unavailable; USDOT numbers remain.');
  }

  return {
    status: notes.length > 0 ? 'unavailable' : 'hit',
    data: records,
    source: { ...FMCSA_SOURCE, fetchedAt },
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}
