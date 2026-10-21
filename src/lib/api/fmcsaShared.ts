/**
 * Shared FMCSA Socrata helpers: dataset IDs, field coercion, business-only
 * carrier naming and census parsing. Used by the VIN history and the
 * plate / carrier / fleet lookups.
 */

import type { CarrierProfile } from '../types';
import { asRecord, intOrNull, stringOrNull } from './http';

export const FMCSA_BASE = 'https://data.transportation.gov/resource';
export const UNIT_DATASET = 'wt8s-2hbx';
export const INSPECTION_DATASET = 'fx4q-ay7w';
export const VIOLATION_DATASET = '876r-jsdb';
export const CENSUS_DATASET = 'az4n-8mr2';

export const FMCSA_SOURCE = {
  name: 'FMCSA roadside inspections (U.S. DOT Open Data)',
  url: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
} as const;

export const CENSUS_SOURCE = {
  name: 'FMCSA Company Census (U.S. DOT Open Data)',
  url: 'https://data.transportation.gov/d/az4n-8mr2',
} as const;

export const UNIT_SELECT =
  'inspection_id,insp_unit_id,insp_unit_number,insp_unit_type_id,insp_unit_make,' +
  'insp_unit_company,insp_unit_license,insp_unit_license_state,insp_unit_vehicle_id_number';

export const INSPECTION_SELECT =
  'inspection_id,dot_number,report_state,insp_date,location,location_desc,insp_level_id,' +
  'viol_total,oos_total,vehicle_viol_total,vehicle_oos_total';

export const CENSUS_SELECT =
  'dot_number,legal_name,dba_name,business_org_id,business_org_desc,status_code,classdef,' +
  'carrier_operation,hm_ind,mcs150_mileage,mcs150_mileage_year,' +
  'crgo_genfreight,crgo_household,crgo_metalsheet,crgo_motoveh,crgo_drivetow,crgo_logpole,' +
  'crgo_bldgmat,crgo_mobilehome,crgo_machlrg,crgo_produce,crgo_liqgas,crgo_intermodal,' +
  'crgo_passengers,crgo_oilfield,crgo_livestock,crgo_grainfeed,crgo_coalcoke,crgo_meat,' +
  'crgo_garbage,crgo_usmail,crgo_chem,crgo_drybulk,crgo_coldfood,crgo_beverages,' +
  'crgo_paperprod,crgo_utility,crgo_farmsupp,crgo_construct,crgo_waterwell,crgo_cargoothr,crgo_cargoothr_desc,' +
  'truck_units,power_units,total_drivers,recordable_crash_rate,mcs150_date,add_date,' +
  'docket1prefix,docket1,docket1_status_code,safety_rating,safety_rating_date,phy_city,phy_state';

export function textField(value: unknown): string | null {
  if (typeof value === 'string') return stringOrNull(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function numberField(value: unknown): number | null {
  const raw = textField(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Escape a value for a single-quoted SoQL string literal. */
export function soqlString(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

export function socrataUrl(
  dataset: string,
  params: { where: string; select: string; limit: number; order?: string },
): string {
  const url = new URL(FMCSA_BASE + '/' + dataset + '.json');
  url.searchParams.set('$where', params.where);
  url.searchParams.set('$select', params.select);
  if (params.order) url.searchParams.set('$order', params.order);
  url.searchParams.set('$limit', String(params.limit));
  return url.toString();
}

export function isoDate(value: unknown): string | null {
  const raw = textField(value);
  if (!raw) return null;
  if (/^\d{8}/.test(raw)) {
    return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
  }
  const date = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function isOutOfService(value: unknown): boolean {
  const raw = textField(value)?.toUpperCase();
  return raw === 'Y' || raw === '1' || raw === 'TRUE';
}

const BUSINESS_ORG_DESCRIPTIONS = new Set(['CORPORATION', 'PARTNERSHIP']);
const BUSINESS_NAME_SUFFIXES = new Set([
  'CO', 'COMPANY', 'CORP', 'CORPORATION', 'INC', 'INCORPORATED', 'LTD', 'LIMITED',
  'LLC', 'LLP', 'LP', 'PLLC', 'PC',
]);

export function nonPlaceholderName(value: unknown): string | null {
  const name = textField(value)?.replace(/\s+/g, ' ').trim() ?? null;
  if (!name || /^(?:NONE|N\/?A|NOT APPLICABLE|UNKNOWN|OWNER|INDIVIDUAL|-)$/i.test(name)) {
    return null;
  }
  return name;
}

/** Names are shown only for explicit business entities or clear legal entity suffixes. */
export function carrierBusinessName(
  value: unknown,
  businessOrgId: string | null,
  businessOrgDescription: string | null,
): string | null {
  const name = nonPlaceholderName(value);
  if (!name) return null;

  const orgId = businessOrgId?.trim();
  const orgDescription = businessOrgDescription?.trim().toUpperCase();
  if (orgId === '1' || orgDescription === 'INDIVIDUAL') return null;
  if (
    orgId === '2' || orgId === '3' ||
    BUSINESS_ORG_DESCRIPTIONS.has(orgDescription ?? '')
  ) {
    return name;
  }

  const words = name.toUpperCase().replace(/[.,]+$/g, '').split(/\s+/);
  return BUSINESS_NAME_SUFFIXES.has(words[words.length - 1] ?? '') ? name : null;
}

/**
 * Map one Company Census row. Names and the base city/state are kept only
 * when the carrier is an identified business; individual operators keep
 * their USDOT number and census fields but no name or place.
 */
export function parseCarrier(value: unknown): CarrierProfile | null {
  const row = asRecord(value);
  if (!row) return null;
  const dotNumber = textField(row['dot_number']);
  if (!dotNumber || !/^\d+$/.test(dotNumber)) return null;
  const orgId = textField(row['business_org_id']);
  const orgDescription = textField(row['business_org_desc']);
  const legalName = carrierBusinessName(row['legal_name'], orgId, orgDescription);
  const dbaName = legalName
    ? nonPlaceholderName(row['dba_name'])
    : carrierBusinessName(row['dba_name'], orgId, orgDescription);
  const isBusiness = Boolean(legalName || dbaName);
  const cargoLabels: ReadonlyArray<readonly [string, string]> = [
    ['crgo_genfreight', 'General freight'],
    ['crgo_household', 'Household goods'],
    ['crgo_metalsheet', 'Metal sheets/coils'],
    ['crgo_motoveh', 'Motor vehicles'],
    ['crgo_drivetow', 'Drive/tow away'],
    ['crgo_logpole', 'Logs and poles'],
    ['crgo_bldgmat', 'Building materials'],
    ['crgo_mobilehome', 'Mobile homes'],
    ['crgo_machlrg', 'Machinery and large objects'],
    ['crgo_produce', 'Fresh produce'],
    ['crgo_liqgas', 'Liquids and gases'],
    ['crgo_intermodal', 'Intermodal containers'],
    ['crgo_passengers', 'Passengers'],
    ['crgo_oilfield', 'Oilfield equipment'],
    ['crgo_livestock', 'Livestock'],
    ['crgo_grainfeed', 'Grain, feed, hay'],
    ['crgo_coalcoke', 'Coal and coke'],
    ['crgo_meat', 'Meat'],
    ['crgo_garbage', 'Garbage and refuse'],
    ['crgo_usmail', 'U.S. Mail'],
    ['crgo_chem', 'Chemicals'],
    ['crgo_drybulk', 'Dry bulk'],
    ['crgo_coldfood', 'Refrigerated food'],
    ['crgo_beverages', 'Beverages'],
    ['crgo_paperprod', 'Paper products'],
    ['crgo_utility', 'Utilities'],
    ['crgo_farmsupp', 'Farm supplies'],
    ['crgo_construct', 'Construction'],
    ['crgo_waterwell', 'Water well'],
    ['crgo_cargoothr', 'Other cargo'],
  ];
  const cargoClasses = cargoLabels
    .filter(([field]) => ['X', 'Y', '1', 'TRUE'].includes(textField(row[field])?.toUpperCase() ?? ''))
    .map(([, label]) => label);
  return {
    dotNumber,
    legalName,
    dbaName: dbaName && dbaName !== legalName ? dbaName : null,
    isBusiness,
    status: textField(row['status_code']),
    operationClass: textField(row['classdef']),
    carrierOperation: textField(row['carrier_operation']),
    hazmatIndicator: textField(row['hm_ind']),
    reportedMileage: intOrNull(row['mcs150_mileage']),
    reportedMileageYear: intOrNull(row['mcs150_mileage_year']),
    cargoClasses,
    otherCargoDescription: textField(row['crgo_cargoothr_desc']),
    truckUnits: intOrNull(row['truck_units']),
    powerUnits: intOrNull(row['power_units']),
    drivers: intOrNull(row['total_drivers']),
    recordableCrashRate: numberField(row['recordable_crash_rate']),
    mcs150Date: isoDate(row['mcs150_date']),
    addedDate: isoDate(row['add_date']),
    docketPrefix: textField(row['docket1prefix']),
    docketNumber: textField(row['docket1']),
    authorityStatus: textField(row['docket1_status_code']),
    safetyRating: textField(row['safety_rating']),
    safetyRatingDate: isoDate(row['safety_rating_date']),
    baseCity: isBusiness ? textField(row['phy_city']) : null,
    baseState: isBusiness ? textField(row['phy_state']) : null,
  };
}

/** Raw unit row from Inspections per Unit. */
export interface UnitRow {
  inspectionId: string;
  unitId: string | null;
  position: number | null;
  vin: string | null;
  plate: string | null;
  plateState: string | null;
  make: string | null;
  typeCode: string | null;
  companyUnit: string | null;
}

export function parseUnit(value: unknown): UnitRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const inspectionId = textField(row['inspection_id']);
  if (!inspectionId || !/^\d+$/.test(inspectionId)) return null;
  const vin = textField(row['insp_unit_vehicle_id_number'])?.toUpperCase() ?? null;
  const plate = textField(row['insp_unit_license'])?.toUpperCase() ?? null;
  return {
    inspectionId,
    unitId: textField(row['insp_unit_id']),
    position: intOrNull(row['insp_unit_number']),
    vin: vin && /^[A-Z0-9]{5,17}$/.test(vin) ? vin : null,
    // Inspectors record "NA", "NONE" or "UNK" when a unit has no readable plate.
    plate: plate && !/^(?:NA|N\/A|NONE|UNK|UNKNOWN|NO ?PLATE|NO ?TAG|0+)$/.test(plate) ? plate : null,
    plateState: textField(row['insp_unit_license_state'])?.toUpperCase() ?? null,
    make: textField(row['insp_unit_make']),
    typeCode: textField(row['insp_unit_type_id']),
    companyUnit: textField(row['insp_unit_company']),
  };
}

/** Inspection-level fields keyed by inspection ID. */
export interface InspectionRow {
  inspectionId: string;
  dotNumber: string | null;
  date: string | null;
  state: string | null;
  site: string | null;
  level: string | null;
  violations: number | null;
  outOfService: number | null;
  vehicleViolations: number | null;
  vehicleOutOfService: number | null;
}

export function parseInspection(value: unknown): InspectionRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const inspectionId = textField(row['inspection_id']);
  if (!inspectionId) return null;
  const dot = textField(row['dot_number']);
  return {
    inspectionId,
    dotNumber: dot && /^\d+$/.test(dot) ? String(Number(dot)) : null,
    date: isoDate(row['insp_date']),
    state: textField(row['report_state']),
    site: textField(row['location_desc']) ?? textField(row['location']),
    level: textField(row['insp_level_id']),
    violations: intOrNull(row['viol_total']),
    outOfService: intOrNull(row['oos_total']),
    vehicleViolations: intOrNull(row['vehicle_viol_total']),
    vehicleOutOfService: intOrNull(row['vehicle_oos_total']),
  };
}

const UNIT_TYPES: Readonly<Record<string, string>> = {
  '9': 'Semi-trailer',
  '10': 'Straight truck',
  '11': 'Truck tractor',
  '14': 'Intermodal chassis',
};

export function unitTypeLabel(code: string | null): string | null {
  if (!code) return null;
  return UNIT_TYPES[code] ?? null;
}

/** Numeric ID lists for `in (...)` clauses on number-typed columns. */
export function numericList(ids: readonly string[]): string {
  return ids.filter((id) => /^\d+$/.test(id)).join(',');
}

/** Quoted ID lists for `in (...)` clauses on text-typed columns. */
export function quotedList(ids: readonly string[]): string {
  return ids.filter((id) => /^\d+$/.test(id)).map((id) => "'" + id + "'").join(',');
}
