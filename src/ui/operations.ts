/** Operational snapshot: latest dated public records and source freshness. */

import type {
  CommercialInspection,
  ComplaintRecord,
  ComplaintsSummary,
  FuelEconomy,
  GuidedLink,
  OdometerReading,
  RecallCampaign,
  SafetyRating,
  SectionResult,
  VehicleIdentity,
} from '../lib/types';
import { clear, el, formatDate, formatDateTime, formatNumber } from './dom';

interface ActivityItem {
  readonly date: string;
  readonly dateValue: number;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly scope: string;
}
interface SourceCardSpec {
  readonly id: string;
  readonly label: string;
  readonly scope: string;
}

export interface OperationsSnapshot {
  readonly root: HTMLElement;
  setIdentity(result: SectionResult<VehicleIdentity>): void;
  setRecalls(result: SectionResult<RecallCampaign[]>): void;
  setComplaints(result: SectionResult<ComplaintsSummary>): void;
  setOdometer(result: SectionResult<OdometerReading[]>): void;
  setCommercialInspections(result: SectionResult<CommercialInspection[]>): void;
  setSafety(result: SectionResult<unknown>): void;
  setFuelEconomy(result: SectionResult<unknown>): void;
  setGuided(links: readonly GuidedLink[]): void;
}

const SOURCE_SPECS: readonly SourceCardSpec[] = [
  { id: 'identity', label: 'Vehicle identity', scope: 'FEDERAL · NHTSA vPIC' },
  { id: 'recalls', label: 'Recall campaigns', scope: 'FEDERAL · MODEL LINE' },
  { id: 'complaints', label: 'Safety complaints', scope: 'FEDERAL · VIN PREFIX' },
  { id: 'safety', label: 'Crash-test ratings', scope: 'FEDERAL · NHTSA NCAP' },
  { id: 'odometer', label: 'Inspection mileage', scope: 'STATE · NEW YORK ONLY' },
  { id: 'commercial-inspections', label: 'Commercial roadside inspections', scope: 'FMCSA · STATE + FEDERAL ENFORCEMENT' },
  { id: 'fuel-economy', label: 'Vehicle specifications', scope: 'FEDERAL · EPA' },
];

function parsedDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shortText(value: string, max = 154): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1).trimEnd()}…` : normalized;
}

function complaintItem(record: ComplaintRecord): ActivityItem | null {
  const dateValue = parsedDate(record.dateComplaintFiled);
  if (dateValue === null) return null;
  const detail = [
    record.summary ? shortText(record.summary) : null,
    record.dateOfIncident ? `Incident date: ${formatDate(record.dateOfIncident)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  return {
    date: record.dateComplaintFiled,
    dateValue,
    label: 'NHTSA ODI · complaint filed',
    title: record.components || `NHTSA complaint #${record.odiNumber}`,
    detail: `${detail || 'Complaint shares this VIN’s 11-character prefix'} · prefix match only; not exact 17-character VIN confirmation`,
    scope: 'VIN PREFIX',
  };
}

function activityCard(item: ActivityItem, featured = false): HTMLElement {
  return el(
    'article',
    { class: featured ? 'activity-item activity-item--featured' : 'activity-item' },
    el(
      'div',
      { class: 'activity-item__date' },
      el('time', { datetime: item.date }, formatDate(item.date)),
      el('span', { class: 'activity-item__scope' }, item.scope),
    ),
    el(
      'div',
      { class: 'activity-item__content' },
      el('p', { class: 'activity-item__label' }, item.label),
      el('h3', { class: 'activity-item__title' }, item.title),
      el('p', { class: 'activity-item__detail' }, item.detail),
    ),
  );
}

function sourceStatusLabel(status: SectionResult<unknown>['status']): string {
  switch (status) {
    case 'hit':
      return 'Response received';
    case 'miss':
      return 'No match in source';
    case 'unavailable':
      return 'Source unavailable';
    case 'guided':
      return 'Manual check';
    case 'loading':
      return 'Checking';
  }
}

function hasUsefulSourceData(id: string, data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (id === 'identity') {
    const identity = data as VehicleIdentity;
    return Boolean(identity.make.trim() || identity.model.trim() || identity.modelYear !== null);
  }
  if (id === 'recalls' || id === 'odometer' || id === 'commercial-inspections') {
    return Array.isArray(data) && data.length > 0;
  }
  if (id === 'complaints') {
    const summary = data as ComplaintsSummary;
    return summary.vinMatches.length > 0 || summary.totalForVehicleLine > 0;
  }
  if (id === 'safety') {
    const rating = data as SafetyRating;
    return Boolean(
      rating.vehicleDescription.trim() ||
      rating.overallRating?.trim() ||
      rating.frontCrashRating?.trim() ||
      rating.sideCrashRating?.trim() ||
      rating.rolloverRating?.trim() ||
      rating.vehiclePicture?.trim() ||
      rating.complaintsCount !== null ||
      rating.recallsCount !== null ||
      rating.investigationCount !== null,
    );
  }
  if (id === 'fuel-economy') {
    const fuel = data as FuelEconomy;
    return Boolean(
      fuel.city !== null ||
      fuel.highway !== null ||
      fuel.combined !== null ||
      fuel.co2GramsPerMile !== null ||
      fuel.fuelType?.trim() ||
      fuel.matchedName?.trim(),
    );
  }
  return false;
}

function sourceDetail(id: string, result: SectionResult<unknown>, hasData: boolean): string {
  if (result.note) return result.note;
  if (result.status !== 'hit' || !hasData) return sourceStatusLabel(result.status);
  if (id === 'identity') {
    const identity = result.data as VehicleIdentity;
    return [identity.modelYear, identity.make, identity.model]
      .filter((part): part is string | number => part !== null && part !== '')
      .join(' ');
  }
  if (id === 'safety') {
    const rating = result.data as SafetyRating;
    const details = [
      rating.vehicleDescription.trim(),
      rating.overallRating ? `Overall rating ${rating.overallRating}` : null,
      rating.frontCrashRating ? `front ${rating.frontCrashRating}` : null,
      rating.sideCrashRating ? `side ${rating.sideCrashRating}` : null,
      rating.rolloverRating ? `rollover ${rating.rolloverRating}` : null,
    ].filter((part): part is string => Boolean(part));
    return details.length > 0
      ? `NCAP match: ${details.join(' · ')}.`
      : 'NHTSA returned NCAP data for this vehicle line.';
  }
  if (id === 'fuel-economy') {
    const fuel = result.data as FuelEconomy;
    return `EPA vehicle match: ${fuel.matchedName ?? 'fuel economy data returned'}.`;
  }
  return 'Data returned by the source.';
}

export function createOperationsSnapshot(): OperationsSnapshot {
  const activityFeatured = el('div', { class: 'activity-featured' });
  const activityList = el('div', { class: 'activity-list' });
  const activityMessage = el(
    'p',
    { class: 'activity-empty' },
    'Checking NHTSA, FMCSA and state public records…',
  );
  const checkedAt = el('span', { class: 'source-board__checked' }, 'Checks are starting…');
  const sourceRows = new Map<
    string,
    { row: HTMLElement; status: HTMLElement; detail: HTMLElement; checked: HTMLElement }
  >();
  const sources = el('div', { class: 'source-board__rows' });
  const sourceEmpty = el(
    'p',
    { class: 'source-board__empty', 'aria-live': 'polite' },
    'Checking connected sources…',
  );

  for (const spec of SOURCE_SPECS) {
    const status = el('span', { class: 'source-row__status source-row__status--loading' }, 'Checking');
    const detail = el('p', { class: 'source-row__detail' }, 'Waiting for the source response.');
    const checked = el('span', { class: 'source-row__checked' }, 'Pending');
    const row = el(
      'article',
      { class: 'source-row', 'data-source-id': spec.id },
      el(
        'div',
        { class: 'source-row__top' },
        el(
          'div',
          {},
          el('p', { class: 'source-row__scope' }, spec.scope),
          el('h3', { class: 'source-row__name' }, spec.label),
        ),
        status,
      ),
      detail,
      checked,
    );
    row.hidden = true;
    sourceRows.set(spec.id, { row, status, detail, checked });
    sources.append(row);
  }
  sources.append(sourceEmpty);

  const activityPanel = el(
    'section',
    { class: 'ops-panel ops-panel--activity', id: 'latest-activity', 'aria-labelledby': 'latest-activity-heading' },
    el(
      'div',
      { class: 'ops-panel__head' },
      el(
        'div',
        {},
        el('p', { class: 'ops-panel__eyebrow' }, 'VEHICLE SIGNALS'),
        el('h2', { class: 'ops-panel__title', id: 'latest-activity-heading', tabindex: '-1' }, 'Latest reported activity'),
      ),
      el('span', { class: 'ops-panel__count' }, 'Newest first'),
    ),
    el(
      'p',
      { class: 'ops-panel__lede' },
      'Sorted by the date on each record. Query times appear separately; public sources may publish records late.',
    ),
    activityFeatured,
    activityList,
    activityMessage,
  );

  const sourcePanel = el(
    'section',
    { class: 'ops-panel ops-panel--sources', id: 'source-status', 'aria-labelledby': 'source-status-heading' },
    el(
      'div',
      { class: 'ops-panel__head' },
      el(
        'div',
        {},
        el('p', { class: 'ops-panel__eyebrow' }, 'SOURCE MONITOR'),
        el('h2', { class: 'ops-panel__title', id: 'source-status-heading', tabindex: '-1' }, 'What was checked'),
      ),
      checkedAt,
    ),
    el(
      'p',
      { class: 'ops-panel__lede' },
      'Each time below is when High View queried the source, not the source’s own publication date.',
    ),
    sources,
  );

  const root = el('div', { class: 'operations-snapshot' }, activityPanel, sourcePanel);
  const activity: ActivityItem[] = [];
  const settled = new Set<string>();
  const sourceSettled = new Set<string>();
  let latestQuery = 0;

  const renderActivity = (): void => {
    clear(activityFeatured);
    clear(activityList);
    const sorted = [...activity].sort((a, b) => b.dateValue - a.dateValue);
    if (sorted.length > 0) {
      const newest = sorted[0];
      if (newest) {
        activityFeatured.append(
          el('p', { class: 'activity-featured__kicker' }, 'NEWEST DATED RECORD'),
          activityCard(newest, true),
        );
      }
      for (const item of sorted.slice(1, 5)) activityList.append(activityCard(item));
      activityMessage.hidden = true;
      return;
    }
    if (settled.size < 4) {
      activityMessage.textContent = 'Checking NHTSA, FMCSA and state public records…';
      activityMessage.hidden = false;
      return;
    }
    activityMessage.textContent =
      'No dated event was returned by the connected NHTSA, FMCSA and New York feeds. This does not rule out records from other sources or a vehicle’s current location.';
    activityMessage.hidden = false;
  };

  const setSource = (id: string, result: SectionResult<unknown>): void => {
    const elements = sourceRows.get(id);
    if (!elements) return;
    const hasData = result.status === 'hit' && hasUsefulSourceData(id, result.data);
    elements.row.hidden = !hasData;
    sourceSettled.add(id);
    const hasVisibleSource = [...sourceRows.values()].some(({ row }) => !row.hidden);
    sourceEmpty.hidden = hasVisibleSource;
    if (!hasVisibleSource) {
      sourceEmpty.textContent = sourceSettled.size === SOURCE_SPECS.length
        ? 'No connected source returned matching information for this VIN.'
        : 'Checking connected sources…';
    }
    const timestamp = parsedDate(result.source.fetchedAt);
    const status = sourceStatusLabel(result.status);
    elements.status.textContent = status;
    elements.status.className = `source-row__status source-row__status--${result.status}`;
    elements.detail.textContent = sourceDetail(id, result, hasData);
    elements.checked.textContent = timestamp === null
      ? 'Query time not reported'
      : `Queried ${formatDateTime(new Date(timestamp).toISOString())}`;
    if (timestamp !== null && timestamp > latestQuery) {
      latestQuery = timestamp;
      checkedAt.textContent = `Latest query · ${formatDateTime(new Date(timestamp).toISOString())}`;
    }
  };

  const addRecallEvents = (campaigns: readonly RecallCampaign[]): ActivityItem[] =>
    campaigns.flatMap((campaign) => {
      const dateValue = parsedDate(campaign.reportReceivedDate);
      if (dateValue === null) return [];
      return [{
        date: campaign.reportReceivedDate,
        dateValue,
        label: 'NHTSA · recall campaign',
        title: campaign.component || `Campaign ${campaign.campaignNumber}`,
        detail: `${shortText(campaign.summary || campaign.consequence || 'Recall record published.')} · Model-line result; verify this VIN with the manufacturer.`,
        scope: 'MODEL LINE',
      }];
    });

  const commercialInspectionEvents = (
    records: readonly CommercialInspection[],
  ): ActivityItem[] =>
    records.flatMap((record) => {
      if (!record.date) return [];
      const dateValue = parsedDate(record.date);
      if (dateValue === null) return [];
      const carrier = record.carrierDotNumber
        ? 'USDOT ' + record.carrierDotNumber
        : 'Carrier not returned';
      const plate = record.plate
        ? 'Plate ' + record.plate + (record.plateState ? ' (' + record.plateState + ')' : '')
        : null;
      const vehicleStatus =
        record.vehicleOutOfService === null
          ? 'vehicle OOS result not reported'
          : record.vehicleOutOfService > 0
            ? 'vehicle placed out of service'
            : 'no vehicle OOS recorded';
      const findings =
        record.vehicleViolations === null
          ? 'Vehicle violation count not reported'
          : formatNumber(record.vehicleViolations) + ' vehicle violation(s)';
      return [{
        date: record.date,
        dateValue,
        label: 'FMCSA · roadside inspection',
        title: [record.state, record.location].filter((part): part is string => Boolean(part)).join(' · ') || 'Commercial roadside inspection',
        detail: [carrier, plate, findings, vehicleStatus].filter((part): part is string => Boolean(part)).join(' · '),
        scope: 'HISTORICAL · NOT LIVE LOCATION',
      }];
    });

  return {
    root,
    setIdentity(result): void {
      setSource('identity', result);
    },
    setRecalls(result): void {
      settled.add('recalls');
      setSource('recalls', result);
      if (result.status === 'hit' && result.data) {
        activity.splice(0, activity.length, ...activity.filter((item) => item.label !== 'NHTSA · recall campaign'), ...addRecallEvents(result.data));
      }
      renderActivity();
    },
    setComplaints(result): void {
      settled.add('complaints');
      setSource('complaints', result);
      if (result.status === 'hit' && result.data) {
        const matches = result.data.vinMatches.map(complaintItem).filter((item): item is ActivityItem => item !== null);
        activity.splice(0, activity.length, ...activity.filter((item) => item.label !== 'NHTSA ODI · complaint filed'), ...matches);
      }
      renderActivity();
    },
    setOdometer(result): void {
      settled.add('odometer');
      setSource('odometer', result);
      if (result.status === 'hit' && result.data) {
        const inspections = result.data.flatMap((reading) => {
          const dateValue = parsedDate(reading.date);
          if (dateValue === null) return [];
          return [{
            date: reading.date,
            dateValue,
            label: 'New York · state inspection',
            title: `${formatNumber(reading.miles)} miles recorded`,
            detail: reading.note ? shortText(reading.note) : 'Inspection mileage returned for this VIN.',
            scope: 'NY · VIN MATCH',
          }];
        });
        activity.splice(0, activity.length, ...activity.filter((item) => item.label !== 'New York · state inspection'), ...inspections);
      }
      renderActivity();
    },
    setCommercialInspections(result): void {
      settled.add('commercial-inspections');
      setSource('commercial-inspections', result);
      if (result.data) {
        activity.splice(
          0,
          activity.length,
          ...activity.filter((item) => item.label !== 'FMCSA · roadside inspection'),
          ...commercialInspectionEvents(result.data),
        );
      }
      renderActivity();
    },
    setSafety(result): void {
      setSource('safety', result);
    },
    setFuelEconomy(result): void {
      setSource('fuel-economy', result);
    },
    setGuided(_links): void {
      // Manual lookups are linked elsewhere; Source Monitor shows queried sources only.
    },
  };
}
