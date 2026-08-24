/**
 * NHTSA recall campaigns by year/make/model (Tier 0, CORS: reflects Origin).
 * https://api.nhtsa.gov/recalls/recallsByVehicle
 */

import type { RecallCampaign, SectionResult, VehicleIdentity } from '../types';
import { asArray, asRecord, fetchJson, stringOrNull, usDateToIso } from './http';

const RECALLS_URL = 'https://api.nhtsa.gov/recalls/recallsByVehicle';

const SOURCE = {
  name: 'NHTSA Recalls',
  url: 'https://www.nhtsa.gov/recalls',
} as const;

/** Map one raw NHTSA recall record to the shared RecallCampaign shape. */
export function mapRecallRecord(record: Record<string, unknown>): RecallCampaign {
  return {
    campaignNumber: stringOrNull(record['NHTSACampaignNumber']) ?? '',
    reportReceivedDate: usDateToIso(stringOrNull(record['ReportReceivedDate']) ?? ''),
    component: stringOrNull(record['Component']) ?? '',
    summary: stringOrNull(record['Summary']) ?? '',
    consequence: stringOrNull(record['Consequence']) ?? '',
    remedy: stringOrNull(record['Remedy']) ?? '',
    parkIt: record['parkIt'] === true,
    parkOutSide: record['parkOutSide'] === true,
    overTheAirUpdate: record['overTheAirUpdate'] === true,
  };
}

/** Parse a full recalls response body into campaigns (newest first), else null. */
export function parseRecallsResponse(body: unknown): RecallCampaign[] | null {
  const root = asRecord(body);
  if (!root) return null;
  const results = asArray(root['results']) ?? asArray(root['Results']);
  if (!results) return null;
  return results
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null)
    .map(mapRecallRecord)
    .sort((a, b) => b.reportReceivedDate.localeCompare(a.reportReceivedDate));
}

export async function getRecalls(
  identity: VehicleIdentity,
): Promise<SectionResult<RecallCampaign[]>> {
  const { make, model, modelYear } = identity;
  const fetchedAt = new Date().toISOString();
  const source = { ...SOURCE, fetchedAt };

  if (make === '' || model === '' || modelYear === null) {
    return {
      status: 'unavailable',
      source,
      note: 'Recall lookup needs the decoded make, model, and model year — the VIN decode did not provide them.',
    };
  }

  const url =
    `${RECALLS_URL}?make=${encodeURIComponent(make)}` +
    `&model=${encodeURIComponent(model)}&modelYear=${modelYear}`;
  const fetched = await fetchJson(url);
  if (!fetched.ok) {
    return { status: 'unavailable', source, note: `Recall lookup failed. ${fetched.note}` };
  }

  const campaigns = parseRecallsResponse(fetched.data);
  if (campaigns === null) {
    return {
      status: 'unavailable',
      source,
      note: 'The NHTSA recall service returned an unexpected response shape.',
    };
  }

  if (campaigns.length === 0) {
    return {
      status: 'hit',
      data: [],
      source,
      note: `NHTSA lists zero recall campaigns for the ${modelYear} ${make} ${model}.`,
    };
  }
  return {
    status: 'hit',
    data: campaigns,
    source,
    note: `Campaigns apply to the ${modelYear} ${make} ${model} line — a dealer or the OEM recall lookup can confirm whether this specific VIN is affected and repaired.`,
  };
}
