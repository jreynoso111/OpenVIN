/**
 * Free FMCSA roadside-inspection history matched to an exact VIN.
 * Queries only public vehicle, inspection-count, violation and carrier fields.
 * The datasets are public and require no API key.
 */

import type {
  CommercialInspection,
  CommercialInspectionViolation,
  SectionResult,
} from '../types';
import { asArray, asRecord, fetchJson, intOrNull, stringOrNull } from './http';

const BASE = 'https://data.transportation.gov/resource';
const UNIT_DATASET = 'wt8s-2hbx';
const INSPECTION_DATASET = 'fx4q-ay7w';
const VIOLATION_DATASET = '876r-jsdb';
const CENSUS_DATASET = 'az4n-8mr2';
const MAX_UNITS = 500;

const SOURCE = {
  name: 'FMCSA roadside inspections (U.S. DOT Open Data)',
  url: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
} as const;

interface UnitRecord {
  inspectionId: string;
  unitId: string | null;
  plate: string | null;
  plateState: string | null;
  make: string | null;
  typeCode: string | null;
}

function textField(value: unknown): string | null {
  if (typeof value === 'string') return stringOrNull(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function socrataUrl(
  dataset: string,
  where: string,
  select: string,
  limit: number,
): string {
  const url = new URL(BASE + '/' + dataset + '.json');
  url.searchParams.set('$where', where);
  url.searchParams.set('$select', select);
  url.searchParams.set('$limit', String(limit));
  return url.toString();
}

function parseUnit(value: unknown): UnitRecord | null {
  const row = asRecord(value);
  if (!row) return null;
  const inspectionId = textField(row['inspection_id']);
  if (!inspectionId || !/^\d+$/.test(inspectionId)) return null;
  return {
    inspectionId,
    unitId: textField(row['insp_unit_id']),
    plate: textField(row['insp_unit_license']),
    plateState: textField(row['insp_unit_license_state']),
    make: textField(row['insp_unit_make']),
    typeCode: textField(row['insp_unit_type_id']),
  };
}

function isoDate(value: unknown): string | null {
  const raw = textField(value);
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
  }
  const date = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isOutOfService(value: unknown): boolean {
  const raw = textField(value)?.toUpperCase();
  return raw === 'Y' || raw === '1' || raw === 'TRUE';
}

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
    source: { ...SOURCE, fetchedAt },
    note,
  };
}

export async function getCommercialInspections(
  vin: string,
): Promise<SectionResult<CommercialInspection[]>> {
  const fetchedAt = new Date().toISOString();
  const unitUrl = socrataUrl(
    UNIT_DATASET,
    "insp_unit_vehicle_id_number='" + vin.toUpperCase().replace(/'/g, "''") + "'",
    'inspection_id,insp_unit_id,insp_unit_license,insp_unit_license_state,insp_unit_make,insp_unit_type_id',
    MAX_UNITS,
  );
  const unitResponse = await fetchJson(unitUrl);
  if (!unitResponse.ok) {
    return failed('FMCSA vehicle-unit lookup failed. ' + unitResponse.note, fetchedAt);
  }

  const rawUnits = asArray(unitResponse.data);
  if (!rawUnits) {
    return failed('FMCSA returned an unexpected vehicle-unit response.', fetchedAt);
  }

  const parsedUnits = rawUnits
    .map(parseUnit)
    .filter((unit): unit is UnitRecord => unit !== null);
  const unitMap = new Map<string, UnitRecord>();
  for (const unit of parsedUnits) {
    const key = unit.inspectionId + ':' + (unit.unitId ?? unit.plate + '|' + unit.plateState);
    unitMap.set(key, unit);
  }
  const units = [...unitMap.values()];
  if (units.length === 0) {
    return {
      status: 'miss',
      data: [],
      source: { ...SOURCE, fetchedAt },
      note: 'No exact-VIN match in the current FMCSA inspection files. FMCSA publishes three years of inspection history; older or unreported events will not appear.',
    };
  }

  const inspectionIds = [...new Set(units.map((unit) => unit.inspectionId))];
  const idList = inspectionIds.join(',');
  const inspectionUrl = socrataUrl(
    INSPECTION_DATASET,
    'inspection_id in (' + idList + ')',
    'inspection_id,dot_number,report_state,insp_date,location,location_desc,insp_level_id,viol_total,oos_total,vehicle_viol_total,vehicle_oos_total',
    500,
  );
  const violationUrl = socrataUrl(
    VIOLATION_DATASET,
    'inspection_id in (' + idList + ')',
    'inspection_id,insp_unit_id,viol_code,viol_desc,part_no,out_of_service_indicator',
    2000,
  );
  const [inspectionResponse, violationResponse] = await Promise.all([
    fetchJson(inspectionUrl),
    fetchJson(violationUrl),
  ]);

  const inspectionRows = inspectionResponse.ok ? asArray(inspectionResponse.data) : null;
  const inspectionMap = new Map<string, Record<string, unknown>>();
  for (const value of inspectionRows ?? []) {
    const row = asRecord(value);
    const id = row ? textField(row['inspection_id']) : null;
    if (row && id) inspectionMap.set(id, row);
  }

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

  const carrierDots = [...new Set(
    [...inspectionMap.values()]
      .map((row) => textField(row['dot_number']))
      .filter((dot): dot is string => dot !== null && /^\d+$/.test(dot)),
  )];
  let carrierRows: unknown[] | null = [];
  let carrierFailure: string | null = null;
  if (carrierDots.length > 0) {
    const censusUrl = socrataUrl(
      CENSUS_DATASET,
      'dot_number in (' + carrierDots.join(',') + ')',
      'dot_number,status_code',
      200,
    );
    const censusResponse = await fetchJson(censusUrl);
    carrierRows = censusResponse.ok ? asArray(censusResponse.data) : null;
    if (!censusResponse.ok) carrierFailure = censusResponse.note;
    else if (!carrierRows) carrierFailure = 'FMCSA returned an unexpected carrier census response.';
  }

  const carrierMap = new Map<string, { status: string | null }>();
  for (const value of carrierRows ?? []) {
    const row = asRecord(value);
    if (!row) continue;
    const dot = textField(row['dot_number']);
    if (!dot) continue;
    carrierMap.set(dot, {
      status: textField(row['status_code']),
    });
  }

  const records: CommercialInspection[] = units.map((unit) => {
    const inspection = inspectionMap.get(unit.inspectionId);
    const dot = inspection ? textField(inspection['dot_number']) : null;
    const carrier = dot ? carrierMap.get(dot) : undefined;
    const unitFindings = unit.unitId
      ? findingsByUnit.get(unit.inspectionId + ':' + unit.unitId) ?? []
      : [];
    return {
      inspectionId: unit.inspectionId,
      date: inspection ? isoDate(inspection['insp_date']) : null,
      state: inspection ? textField(inspection['report_state']) : null,
      location: inspection
        ? textField(inspection['location_desc']) ?? textField(inspection['location'])
        : null,
      level: inspection ? textField(inspection['insp_level_id']) : null,
      carrierDotNumber: dot,
      carrierStatusCode: carrier?.status ?? null,
      plate: unit.plate,
      plateState: unit.plateState,
      vehicleMake: unit.make,
      vehicleTypeCode: unit.typeCode,
      inspectionViolations: inspection ? intOrNull(inspection['viol_total']) : null,
      inspectionOutOfService: inspection ? intOrNull(inspection['oos_total']) : null,
      vehicleViolations: inspection ? intOrNull(inspection['vehicle_viol_total']) : null,
      vehicleOutOfService: inspection ? intOrNull(inspection['vehicle_oos_total']) : null,
      vehicleFindings: unitFindings.sort((a, b) => {
        if (a.outOfService !== b.outOfService) return a.outOfService ? -1 : 1;
        return (a.code ?? '').localeCompare(b.code ?? '');
      }),
    };
  });

  records.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const notes = [
    'Exact VIN match. FMCSA roadside inspections can include state and federal enforcement; records are historical, updated from a database that may lag by about a day, and do not show current location.',
  ];
  if (!inspectionRows) {
    notes.push('Inspection dates, location and carrier joins could not be loaded.');
  } else if (inspectionMap.size < inspectionIds.length) {
    notes.push('Some inspection details did not join to the VIN rows.');
  }
  if (!violationRows) {
    notes.push('Unit-level violation descriptions are temporarily unavailable.');
  } else {
    notes.push('Violation descriptions are included only when FMCSA links them to this inspected vehicle unit.');
  }
  if (carrierFailure) notes.push('Carrier status enrichment was unavailable; USDOT numbers remain: ' + carrierFailure);

  const partial =
    !inspectionRows ||
    inspectionMap.size < inspectionIds.length ||
    !violationRows ||
    Boolean(carrierFailure);

  return {
    status: partial ? 'unavailable' : 'hit',
    data: records,
    source: { ...SOURCE, fetchedAt },
    note: notes.join(' '),
  };
}
