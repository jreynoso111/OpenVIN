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
