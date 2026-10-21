/**
 * Shared contract between the data layer (src/lib) and the UI (src/ui, src/main.ts).
 * Do not add owner/person fields of any kind — vehicle data only (docs/LEGAL.md).
 */

export type SectionStatus = 'loading' | 'hit' | 'miss' | 'unavailable' | 'guided';

export interface SourceMeta {
  /** Human-readable source name, e.g. "NHTSA vPIC" */
  name: string;
  /** Human-facing link to the source */
  url?: string;
  fetchedAt?: string; // ISO timestamp
}

export interface SectionResult<T> {
  status: SectionStatus;
  data?: T;
  source: SourceMeta;
  /** Coverage / degradation explanation shown to the user */
  note?: string;
}

export interface VehicleIdentity {
  vin: string;
  modelYear: number | null;
  make: string;
  model: string;
  trim: string | null;
  series: string | null;
  bodyClass: string | null;
  vehicleType: string | null;
  engine: {
    cylinders: number | null;
    displacementL: number | null;
    horsepower: number | null;
    fuelType: string | null;
    configuration: string | null;
  };
  driveType: string | null;
  transmission: string | null;
  plant: { city: string | null; state: string | null; country: string | null };
  gvwr: string | null;
  /** vPIC ErrorText when decode is partial/suspect; null when clean */
  decodeWarning: string | null;
}

export interface RecallCampaign {
  campaignNumber: string;
  reportReceivedDate: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  parkIt: boolean;
  parkOutSide: boolean;
  overTheAirUpdate: boolean;
}

export interface ComplaintRecord {
  odiNumber: number;
  dateComplaintFiled: string;
  dateOfIncident: string | null;
  components: string;
  summary: string;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
  /** Truncated (11-char) VIN as published by NHTSA, may be empty */
  vinPrefix: string;
}

export interface ComplaintsSummary {
  /** Complaints whose 11-char VIN prefix matches this vehicle's squish VIN */
  vinMatches: ComplaintRecord[];
  /** Total complaints filed for this year/make/model */
  totalForVehicleLine: number;
  crashCount: number;
  fireCount: number;
}

export interface SafetyRating {
  vehicleDescription: string;
  overallRating: string | null; // "5", "Not Rated", …
  frontCrashRating: string | null;
  sideCrashRating: string | null;
  rolloverRating: string | null;
  complaintsCount: number | null;
  recallsCount: number | null;
  investigationCount: number | null;
  vehiclePicture: string | null; // https URL from NHTSA, may be null
}

export interface OdometerReading {
  /** ISO date of the observation */
  date: string;
  miles: number;
  source: string; // e.g. "NY State inspection"
  note?: string; // e.g. inspection result
}

/** Public vehicle-unit findings from a commercial roadside inspection. */
export interface CommercialInspectionViolation {
  code: string | null;
  description: string | null;
  part: string | null;
  outOfService: boolean;
}

/** VIN-matched FMCSA event; location is an inspection site, never live GPS. */
export interface CommercialInspection {
  inspectionId: string;
  date: string | null;
  state: string | null;
  location: string | null;
  level: string | null;
  carrierDotNumber: string | null;
  carrierLegalName: string | null;
  carrierDbaName: string | null;
  carrierStatusCode: string | null;
  /** Non-personal fields from the current FMCSA Company Census for this DOT. */
  carrierOperationClass: string | null;
  carrierTruckUnits: number | null;
  carrierPowerUnits: number | null;
  carrierRecordableCrashRate: number | null;
  carrierMcs150Date: string | null;
  carrierDocketPrefix: string | null;
  carrierDocketNumber: string | null;
  carrierAuthorityStatusCode: string | null;
  carrierSafetyRating: string | null;
  carrierSafetyRatingDate: string | null;
  /** Carrier base city/state from the census — business entities only. */
  carrierBaseCity: string | null;
  carrierBaseState: string | null;
  plate: string | null;
  plateState: string | null;
  vehicleMake: string | null;
  vehicleTypeCode: string | null;
  /** Carrier's fleet/unit marking as recorded by the inspector. */
  companyUnit: string | null;
  /** Other units inspected together with this vehicle (tractor, trailer, chassis). */
  companions: UnitSighting[];
  /** Whole inspection totals can include the driver as well as the vehicle. */
  inspectionViolations: number | null;
  inspectionOutOfService: number | null;
  /** Counts specifically attributed to the inspected vehicle. */
  vehicleViolations: number | null;
  vehicleOutOfService: number | null;
  /** Violation descriptions joined to the exact FMCSA vehicle unit ID. */
  vehicleFindings: CommercialInspectionViolation[];
}

export interface FuelEconomy {
  city: number | null;
  highway: number | null;
  combined: number | null;
  co2GramsPerMile: number | null;
  fuelType: string | null;
  matchedName: string | null;
  /** 'exact' when a single EPA vehicle matched, 'approximate' otherwise */
  matchQuality: 'exact' | 'approximate';
}

export interface WarrantyCoverageRow {
  coverage: string; // "Basic", "Powertrain", …
  termMonths: number;
  termMiles: number;
  /** Estimated remaining, null when expired or not estimable */
  estRemainingMonths: number | null;
  estRemainingMiles: number | null;
  note?: string;
}

export interface WarrantyEstimate {
  assumedInServiceDate: string; // ISO date used for the estimate
  assumptionNote: string;
  rows: WarrantyCoverageRow[];
}

export type GuidedLinkKind =
  | 'nmvtis'
  | 'nicb'
  | 'history'
  | 'oem-recall'
  | 'state-title'
  | 'state-emissions'
  | 'auction'
  | 'sticker'
  | 'service';

export interface GuidedLink {
  kind: GuidedLinkKind;
  label: string;
  url: string;
  /** One-sentence instruction: what the user gets there and what to enter */
  description: string;
  /** Optional badge, e.g. "Free" | "Free · 5/day" */
  badge?: string;
}

/**
 * FMCSA Company Census profile. `legalName`, `dbaName`, `baseCity` and
 * `baseState` are populated only for identified business entities.
 */
export interface CarrierProfile {
  dotNumber: string;
  legalName: string | null;
  dbaName: string | null;
  isBusiness: boolean;
  status: string | null;
  operationClass: string | null;
  truckUnits: number | null;
  powerUnits: number | null;
  drivers: number | null;
  recordableCrashRate: number | null;
  mcs150Date: string | null;
  addedDate: string | null;
  docketPrefix: string | null;
  docketNumber: string | null;
  authorityStatus: string | null;
  safetyRating: string | null;
  safetyRatingDate: string | null;
  baseCity: string | null;
  baseState: string | null;
}

/** One inspected unit at one roadside inspection (any search entry point). */
export interface UnitSighting {
  inspectionId: string;
  date: string | null;
  state: string | null;
  site: string | null;
  carrierDotNumber: string | null;
  vin: string | null;
  plate: string | null;
  plateState: string | null;
  make: string | null;
  unitType: string | null;
  /** Carrier's own fleet/unit marking recorded by the inspector (e.g. "2104"). */
  companyUnit: string | null;
  /** 1 = power unit, 2+ = towed units in the same inspection. */
  position: number | null;
  vehicleOutOfService: number | null;
}

/** Vehicles seen in a carrier's recent inspections, grouped by VIN. */
export interface FleetVehicle {
  vin: string;
  make: string | null;
  unitType: string | null;
  plates: string[];
  companyUnits: string[];
  inspectionCount: number;
  lastSeen: UnitSighting;
  firstSeenDate: string | null;
}

export interface CarrierFleet {
  vehicles: FleetVehicle[];
  /** Inspection counts by reporting state, most frequent first. */
  states: Array<{ state: string; count: number; lastDate: string | null }>;
  inspectionsScanned: number;
  /** True when the scan hit its row cap; older inspections were not read. */
  truncated: boolean;
  newestDate: string | null;
  oldestDate: string | null;
}
