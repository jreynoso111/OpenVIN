import type { PlateLink, ReportHandle } from '../lib/report';
import type { CommercialInspection, SectionStatus, UnitSighting } from '../lib/types';

type SourceStatus = Exclude<SectionStatus, 'loading'>;

interface HistoryRow {
  id: string;
  capturedAt: string;
  odometerCount: number;
  latestOdometer: { date: string; miles: number } | null;
  roadsideCount: number;
  latestInspection: { date: string | null; state: string | null; location: string | null } | null;
  recallCount: number;
  complaintMatches: number;
  sourceStatuses: Array<{ id: string; status: string }>;
}

interface StoredSnapshot {
  id: string;
  capturedAt: string;
  sources: Array<{ id: string; status: string }>;
  payload: {
    identity: { modelYear: number | null; make: string | null; model: string | null } | null;
    odometerReadings: Array<{ date: string; miles: number }>;
    commercialInspections: Array<{ date: string | null; state: string | null; location: string | null; plate: string | null; plateState: string | null }>;
    recalls: Array<{ campaignNumber: string | null; reportReceivedDate: string | null; component: string | null }>;
    complaints: { vinMatches: unknown[]; crashCount: number | null; fireCount: number | null };
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendLine(parent: HTMLElement, label: string, value: string): void {
  const line = element('p', 'archive__line');
  const strong = element('strong', undefined, label);
  line.append(strong, document.createTextNode(` ${value}`));
  parent.append(line);
}

function sourceStatus(status: SectionStatus): SourceStatus {
  return status === 'hit' || status === 'miss' || status === 'guided' || status === 'unavailable'
    ? status
    : 'unavailable';
}

function inspection(record: CommercialInspection): Record<string, unknown> {
  return {
    inspectionId: record.inspectionId,
    date: record.date,
    state: record.state,
    location: record.location,
    level: record.level,
    carrierDotNumber: record.carrierDotNumber,
    carrierStatusCode: record.carrierStatusCode,
    carrierOperationClass: record.carrierOperationClass,
    carrierTruckUnits: record.carrierTruckUnits,
    carrierPowerUnits: record.carrierPowerUnits,
    carrierRecordableCrashRate: record.carrierRecordableCrashRate,
    carrierMcs150Date: record.carrierMcs150Date,
    carrierDocketPrefix: record.carrierDocketPrefix,
    carrierDocketNumber: record.carrierDocketNumber,
    carrierAuthorityStatusCode: record.carrierAuthorityStatusCode,
    carrierSafetyRating: record.carrierSafetyRating,
    carrierSafetyRatingDate: record.carrierSafetyRatingDate,
    plate: record.plate,
    plateState: record.plateState,
    vehicleMake: record.vehicleMake,
    vehicleTypeCode: record.vehicleTypeCode,
    companyUnit: record.companyUnit,
    vehicleViolations: record.vehicleViolations,
    vehicleOutOfService: record.vehicleOutOfService,
    companions: (record.companions ?? []).slice(0, 20).map((item: UnitSighting) => ({
      inspectionId: item.inspectionId,
      date: item.date,
      state: item.state,
      site: item.site,
      carrierDotNumber: item.carrierDotNumber,
      vin: item.vin,
      plate: item.plate,
      plateState: item.plateState,
      make: item.make,
      unitType: item.unitType,
      companyUnit: item.companyUnit,
      position: item.position,
      vehicleOutOfService: item.vehicleOutOfService,
    })),
  };
}

function plateLink(link: PlateLink): Record<string, unknown> {
  return {
    plate: link.plate,
    state: link.state,
    sightings: link.sightings.slice(0, 10).map((item) => ({
      inspectionId: item.inspectionId,
      date: item.date,
      state: item.state,
      site: item.site,
      carrierDotNumber: item.carrierDotNumber,
      vin: item.vin,
      plate: item.plate,
      plateState: item.plateState,
      make: item.make,
      unitType: item.unitType,
      companyUnit: item.companyUnit,
      position: item.position,
      vehicleOutOfService: item.vehicleOutOfService,
    })),
  };
}

function localArchiveEnabled(): boolean {
  return window.location.protocol === 'http:'
    && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    && window.location.port === '3117';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`Archive request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function renderSnapshot(parent: HTMLElement, snapshot: StoredSnapshot): void {
  const detail = element('div', 'archive__detail');
  const identity = snapshot.payload.identity;
  appendLine(detail, 'Vehicle', [identity?.modelYear, identity?.make, identity?.model].filter(Boolean).join(' ') || 'Identity unavailable');

  const odometers = snapshot.payload.odometerReadings;
  appendLine(detail, 'NY odometer', odometers.length
    ? odometers.map((row) => `${row.date}: ${row.miles.toLocaleString()} mi`).join(' · ')
    : 'No records');

  const stops = snapshot.payload.commercialInspections;
  appendLine(detail, 'Roadside stops', stops.length
    ? stops.slice(0, 5).map((row) => [row.date, row.state, row.location, row.plate && `plate ${row.plate}${row.plateState ? ` (${row.plateState})` : ''}`].filter(Boolean).join(' · ')).join(' / ')
    : 'No records');

  const recalls = snapshot.payload.recalls;
  appendLine(detail, 'Recall campaigns', recalls.length
    ? recalls.slice(0, 5).map((row) => [row.campaignNumber, row.reportReceivedDate, row.component].filter(Boolean).join(' · ')).join(' / ')
    : 'No records');

  const complaints = snapshot.payload.complaints;
  appendLine(detail, 'NHTSA complaints', `${complaints.vinMatches.length} VIN-prefix matches · ${complaints.crashCount ?? 0} crash flags · ${complaints.fireCount ?? 0} fire flags`);
  appendLine(detail, 'Sources', snapshot.sources.map((source) => `${source.id}: ${source.status}`).join(' · ') || 'No source data');
  parent.replaceChildren(detail);
}

export function mountLocalArchive(
  main: HTMLElement,
  vin: string,
  handles: ReportHandle,
  isCurrent: () => boolean,
): void {
  if (!localArchiveEnabled()) return;

  const section = element('section', 'archive');
  section.setAttribute('aria-labelledby', 'archive-title');
  const heading = element('h2', 'archive__title', 'Local evidence history');
  heading.id = 'archive-title';
  const status = element('p', 'archive__status', 'Waiting for source results…');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const list = element('ol', 'archive__list');
  const detail = element('div', 'archive__selected');
  section.append(heading, element('p', 'archive__note', 'Snapshots stay in the High View database on this Ubuntu server.'), status, list, detail);
  main.append(section);

  const refresh = async (): Promise<void> => {
    const result = await requestJson<{ reports: HistoryRow[] }>(`/api/v1/history?vin=${encodeURIComponent(vin)}`);
    if (!isCurrent()) return;
    list.replaceChildren();
    for (const row of result.reports) {
      const item = element('li', 'archive__item');
      const button = element('button', 'archive__button');
      button.type = 'button';
      const stamp = new Date(row.capturedAt);
      button.textContent = `${stamp.toLocaleString()} · ${row.odometerCount} NY readings · ${row.roadsideCount} roadside stops · ${row.recallCount} recalls`;
      button.addEventListener('click', () => {
        void requestJson<StoredSnapshot>(`/api/v1/history/${encodeURIComponent(row.id)}?vin=${encodeURIComponent(vin)}`)
          .then((snapshot) => { if (isCurrent()) renderSnapshot(detail, snapshot); })
          .catch(() => { if (isCurrent()) detail.textContent = 'This historical snapshot could not be loaded.'; });
      });
      item.append(button);
      list.append(item);
    }
  };

  void refresh().catch(() => {
    if (isCurrent()) status.textContent = 'Could not load previous local snapshots yet.';
  });

  void (async () => {
    try {
      const [identity, ny, fmcsa, recalls, complaints, links] = await Promise.all([
        handles.identity,
        handles.nyInspections,
        handles.commercialInspections,
        handles.recalls,
        handles.complaints,
        handles.plateLinks,
      ]);
      if (!isCurrent()) return;

      const report = {
        vin,
        sources: [
          { id: 'vpic', status: sourceStatus(identity.status) },
          { id: 'ny', status: sourceStatus(ny.status) },
          { id: 'fmcsa', status: sourceStatus(fmcsa.status) },
          { id: 'recalls', status: sourceStatus(recalls.status) },
          { id: 'complaints', status: sourceStatus(complaints.status) },
        ],
        identity: identity.data ?? null,
        odometerReadings: (ny.data ?? []).slice(0, 200).map((row) => ({ date: row.date, miles: row.miles })),
        commercialInspections: (fmcsa.data ?? []).slice(0, 100).map(inspection),
        plateLinks: links.slice(0, 50).map(plateLink),
        recalls: (recalls.data ?? []).slice(0, 100),
        complaints: complaints.data ?? { vinMatches: [], totalForVehicleLine: 0, crashCount: 0, fireCount: 0 },
      };
      status.textContent = 'Saving this source snapshot to the local archive…';
      const saved = await requestJson<{ id: string; capturedAt: string; reports: number }>('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!isCurrent()) return;
      status.textContent = `Saved to local history · snapshot ${saved.id} · ${saved.reports} stored for this VIN`;
      await refresh();
    } catch {
      if (isCurrent()) status.textContent = 'Local history is unavailable. The live report remains available.';
    }
  })();
}
