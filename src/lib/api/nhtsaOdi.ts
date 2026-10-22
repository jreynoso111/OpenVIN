/** Read the Ubuntu-local mirror of public NHTSA ODI manufacturer communications and investigations. */

import type { SectionResult, VehicleIdentity } from '../types';
import { asArray, asRecord, fetchJson, intOrNull, stringOrNull } from './http';

const SOURCE = {
  name: 'NHTSA ODI public data mirror',
  url: 'https://www.nhtsa.gov/nhtsa-datasets-and-apis',
} as const;

export interface NhtsaOdiFreshness {
  checkedAt: string | null;
  sourceUpdatedAt: string | null;
  sourceRows: number;
  sourceFiles: number;
}

export interface NhtsaCommunication {
  nhtsaId: string;
  documentId: string | null;
  replacementBulletinNumber: string | null;
  dateAdded: string | null;
  communicationDate: string | null;
  manufacturerCampaignId: string | null;
  communicationTypes: string[];
  nhtsaComponents: string[];
  manufacturerComponentSystems: string[];
  manufacturerComponentSubsystems: string[];
  make: string;
  model: string;
  modelYear: number;
  summary: string;
}

export interface NhtsaInvestigation {
  actionNumber: string;
  make: string;
  model: string;
  modelYear: number;
  components: string[];
  manufacturer: string | null;
  openedOn: string | null;
  closedOn: string | null;
  campaignNumber: string | null;
  subject: string | null;
  summary: string;
}

export interface NhtsaOdiLookup {
  matchedLine: { year: number; make: string; model: string };
  communications: NhtsaCommunication[];
  communicationCount: number;
  communicationsTruncated: boolean;
  investigations: NhtsaInvestigation[];
  investigationCount: number;
  investigationsTruncated: boolean;
  freshness: {
    manufacturerCommunications: NhtsaOdiFreshness;
    investigations: NhtsaOdiFreshness;
  };
  fetchedAt: string;
}

function localArchiveOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.port === '3117' &&
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
  );
}

export function nhtsaOdiMirrorEnabled(): boolean {
  return localArchiveOrigin();
}

function strings(value: unknown): string[] {
  return (asArray(value) ?? []).flatMap((entry) => {
    const parsed = stringOrNull(entry);
    return parsed ? [parsed] : [];
  });
}

function freshness(value: unknown): NhtsaOdiFreshness {
  const row = asRecord(value) ?? {};
  return {
    checkedAt: stringOrNull(row['checked_at']),
    sourceUpdatedAt: stringOrNull(row['source_modified_at']),
    sourceRows: intOrNull(row['source_rows']) ?? 0,
    sourceFiles: intOrNull(row['source_files']) ?? 0,
  };
}

function communications(value: unknown): NhtsaCommunication[] | null {
  const rows = asArray(value);
  if (!rows) return null;
  return rows.flatMap((value) => {
    const row = asRecord(value);
    const nhtsaId = row ? stringOrNull(row['nhtsa_id']) : null;
    const make = row ? stringOrNull(row['make']) : null;
    const model = row ? stringOrNull(row['model']) : null;
    const modelYear = row ? intOrNull(row['model_year']) : null;
    if (!row || !nhtsaId || !make || !model || modelYear === null) return [];
    return [{
      nhtsaId,
      documentId: stringOrNull(row['document_id']),
      replacementBulletinNumber: stringOrNull(row['replacement_bulletin_number']),
      dateAdded: stringOrNull(row['date_added']),
      communicationDate: stringOrNull(row['communication_date']),
      manufacturerCampaignId: stringOrNull(row['manufacturer_campaign_id']),
      communicationTypes: strings(row['communication_types']),
      nhtsaComponents: strings(row['nhtsa_components']),
      manufacturerComponentSystems: strings(row['manufacturer_component_systems']),
      manufacturerComponentSubsystems: strings(row['manufacturer_component_subsystems']),
      make,
      model,
      modelYear,
      summary: stringOrNull(row['summary']) ?? '',
    }];
  });
}

function investigations(value: unknown): NhtsaInvestigation[] | null {
  const rows = asArray(value);
  if (!rows) return null;
  return rows.flatMap((value) => {
    const row = asRecord(value);
    const actionNumber = row ? stringOrNull(row['action_number']) : null;
    const make = row ? stringOrNull(row['make']) : null;
    const model = row ? stringOrNull(row['model']) : null;
    const modelYear = row ? intOrNull(row['model_year']) : null;
    if (!row || !actionNumber || !make || !model || modelYear === null) return [];
    return [{
      actionNumber,
      make,
      model,
      modelYear,
      components: strings(row['components']),
      manufacturer: stringOrNull(row['manufacturer']),
      openedOn: stringOrNull(row['opened_on']),
      closedOn: stringOrNull(row['closed_on']),
      campaignNumber: stringOrNull(row['campaign_number']),
      subject: stringOrNull(row['subject']),
      summary: stringOrNull(row['summary']) ?? '',
    }];
  });
}

export async function getNhtsaOdiVehicleLine(
  identity: VehicleIdentity,
): Promise<SectionResult<NhtsaOdiLookup>> {
  if (!localArchiveOrigin()) {
    return {
      status: 'unavailable',
      source: { ...SOURCE, fetchedAt: new Date().toISOString() },
      note: 'The NHTSA mirror is available in the Ubuntu-local VinOrbits service.',
    };
  }
  const { make, model, modelYear } = identity;
  if (!make || !model || modelYear === null) {
    return {
      status: 'unavailable',
      source: { ...SOURCE, fetchedAt: new Date().toISOString() },
      note: 'The NHTSA mirror needs a decoded model year, make, and model.',
    };
  }

  const params = new URLSearchParams({ year: String(modelYear), make, model });
  const fetched = await fetchJson(`/api/v1/nhtsa/odi?${params.toString()}`, { timeoutMs: 10_000 });
  const root = fetched.ok ? asRecord(fetched.data) : null;
  const comms = root ? communications(root['communications']) : null;
  const investigationRows = root ? investigations(root['investigations']) : null;
  const freshnessValue = root ? asRecord(root['freshness']) : null;
  const line = root ? asRecord(root['matchedLine']) : null;
  const fetchedAt = root ? stringOrNull(root['fetchedAt']) : null;
  if (!root || !comms || !investigationRows || !freshnessValue || !line || !fetchedAt) {
    return {
      status: 'unavailable',
      source: { ...SOURCE, fetchedAt: new Date().toISOString() },
      note: fetched.ok
        ? 'The local NHTSA mirror returned an unexpected response.'
        : `The local NHTSA mirror could not be reached. ${fetched.note}`,
    };
  }

  const matchedLine = {
    year: intOrNull(line['year']) ?? modelYear,
    make: stringOrNull(line['make']) ?? make,
    model: stringOrNull(line['model']) ?? model,
  };
  const data: NhtsaOdiLookup = {
    matchedLine,
    communications: comms,
    communicationCount: intOrNull(root['communicationCount']) ?? comms.length,
    communicationsTruncated: root['communicationsTruncated'] === true,
    investigations: investigationRows,
    investigationCount: intOrNull(root['investigationCount']) ?? investigationRows.length,
    investigationsTruncated: root['investigationsTruncated'] === true,
    freshness: {
      manufacturerCommunications: freshness(freshnessValue['manufacturerCommunications']),
      investigations: freshness(freshnessValue['investigations']),
    },
    fetchedAt,
  };
  return {
    status: data.communicationCount + data.investigationCount > 0 ? 'hit' : 'miss',
    data,
    source: { ...SOURCE, fetchedAt },
    note: data.communicationCount + data.investigationCount === 0
      ? `No indexed manufacturer communications or investigations matched the ${modelYear} ${make} ${model} line.`
      : undefined,
  };
}
