/**
 * VIN file: identity header, where the unit has been seen, its connections
 * (plates, carriers, coupled units), roadside log, carriers and NY records,
 * with a rail listing every source checked and the official follow-ups.
 */

import { linkedVins, standingFlags, type Flag } from '../lib/analysis';
import { getCarrierStanding } from '../lib/api/fmcsaStanding';
import type { PlateLink } from '../lib/report';
import type {
  CommercialInspection,
  ComplaintsSummary,
  GuidedLink,
  OdometerReading,
  RecallCampaign,
  SectionResult,
  VehicleIdentity,
} from '../lib/types';
import {
  carrierUses,
  renderCarriers,
  renderConnections,
  renderRoadsideLog,
  renderWhereSeen,
} from './commercial';
import { el, formatNumber } from './dom';
import { caseHeader, caseLayout, limitsNote, officialChecks } from './case';
import { renderIdentity } from './identity';
import { findLinks } from './links';
import { renderOdometer } from './odometer';
import { createLedger, createPanel } from './panel';
import { dotPivot, platePivot } from './pivot';
import { renderComplaints, renderRecalls } from './modelLine';
import { renderSummary } from './summary';
import { renderTimeline } from './timeline';

/** Mirror of the data layer's startReport() return shape (src/lib/report). */
export interface ReportHandles {
  readonly identity: Promise<SectionResult<VehicleIdentity>>;
  readonly nyInspections: Promise<SectionResult<OdometerReading[]>>;
  readonly commercialInspections: Promise<SectionResult<CommercialInspection[]>>;
  readonly recalls: Promise<SectionResult<RecallCampaign[]>>;
  readonly complaints: Promise<SectionResult<ComplaintsSummary>>;
  readonly plateLinks: Promise<PlateLink[]>;
  readonly guidedLinks: Promise<GuidedLink[]>;
}

export interface ReportCallbacks {
  readonly onVehicleName: (name: string) => void;
  /** False once this report has been superseded — stale hydrations must no-op. */
  readonly isCurrent: () => boolean;
}

function unavailable<T>(name: string): SectionResult<T> {
  return { status: 'unavailable', source: { name }, note: 'Something went wrong loading this source.' };
}

function settle<T>(promise: Promise<SectionResult<T>>, name: string): Promise<SectionResult<T>> {
  return promise.catch(() => unavailable<T>(name));
}

function keyIdentifiers(records: readonly CommercialInspection[]): HTMLElement | null {
  const plates = new Map<string, HTMLElement>();
  for (const record of records) {
    if (!record.plate) continue;
    const key = record.plate + '|' + (record.plateState ?? '');
    if (!plates.has(key)) plates.set(key, platePivot(record.plate, record.plateState));
  }
  const carriers = carrierUses(records).map((use) =>
    dotPivot(use.carrier.dotNumber, use.carrier.legalName ?? use.carrier.dbaName ?? undefined),
  );
  if (plates.size === 0 && carriers.length === 0) return null;
  return el(
    'div',
    { class: 'ids' },
    plates.size > 0 ? el('div', { class: 'ids__group' }, el('span', { class: 'ids__label' }, 'Plates'), ...plates.values()) : null,
    carriers.length > 0 ? el('div', { class: 'ids__group' }, el('span', { class: 'ids__label' }, 'Carriers'), ...carriers) : null,
  );
}

export function renderReport(
  main: HTMLElement,
  handles: ReportHandles,
  callbacks: ReportCallbacks,
  vin: string,
): void {
  const header = caseHeader('VIN file', vin);
  const summary = createPanel({ id: 'summary', title: 'Summary', hint: 'What the public roadside records show at a glance.', lines: 3 });
  const where = createPanel({ id: 'where', title: 'Where it has been seen', hint: 'Historical roadside stops — not live tracking.', lines: 4 });
  const links = createPanel({ id: 'connections', title: 'Connections', hint: 'Plates, carriers and units recorded with this VIN. Every identifier opens its own file.', lines: 4 });
  const timeline = createPanel({ id: 'timeline', title: 'Timeline', hint: 'Inspections, plate changes and carrier changes in order.', lines: 4 });
  const log = createPanel({ id: 'roadside', title: 'Roadside log', lines: 5 });
  const carriers = createPanel({ id: 'carriers', title: 'Carriers', lines: 3 });
  const recallPanel = createPanel({ id: 'recalls', title: 'Recalls', hint: 'NHTSA campaigns for this year, make and model.', lines: 3 });
  const complaintPanel = createPanel({ id: 'complaints', title: 'Owner complaints', hint: 'NHTSA complaint reports for this model line.', lines: 3 });
  const odometer = createPanel({ id: 'ny', title: 'New York inspections', lines: 3 });

  const ledger = createLedger();
  ledger.add('vpic', 'VIN decode · NHTSA vPIC');
  ledger.add('fmcsa', 'Roadside inspections · FMCSA');
  ledger.add('plates', 'Plate cross-check · FMCSA');
  ledger.add('recalls', 'Recalls · NHTSA');
  ledger.add('complaints', 'Complaints · NHTSA ODI');
  ledger.add('ny', 'NY inspections · data.ny.gov');
  const checks = el('div');

  main.replaceChildren(
    caseLayout(
      header.root,
      [summary.root, where.root, links.root, timeline.root, log.root, carriers.root, recallPanel.root, complaintPanel.root, odometer.root],
      [
        ledger.root,
        checks,
        limitsNote(
          'Roadside records show where a unit was stopped and under which carrier, up to about three years back. They are not a live position, and a carrier on an inspection is not proof of current owner or operator.',
        ),
      ],
    ),
  );

  const live = <T>(run: (value: T) => void) => (value: T): void => {
    if (callbacks.isCurrent()) run(value);
  };

  void settle(handles.identity, 'NHTSA vPIC').then(
    live((result) => {
      const rendered = renderIdentity(result);
      header.setTitle(rendered.vehicleName ?? 'Unidentified vehicle');
      header.setBody(rendered.content);
      ledger.set('vpic', result.status, result.source, result.status === 'hit' ? 'Decoded' : undefined);
      callbacks.onVehicleName(rendered.vehicleName ?? '');
    }),
  );

  // The summary is built once and re-rendered in place as the plate check and
  // the carrier-standing lookup arrive, so it does not flicker.
  let summaryShown = false;
  let summaryRecords: readonly CommercialInspection[] = [];
  let summaryPlates: readonly PlateLink[] | null = null;
  let summaryExtra: readonly Flag[] = [];
  const refreshSummary = (): void => {
    const node = renderSummary(vin, summaryRecords, summaryPlates, summaryExtra);
    if (!summaryShown) {
      summaryShown = true;
      summary.fill(node);
    } else {
      summary.root.querySelector('.panel__body')?.replaceChildren(node);
    }
  };

  const commercial = settle(handles.commercialInspections, 'FMCSA roadside inspections');
  void commercial.then(
    live((result) => {
      const records = result.data ?? [];
      ledger.set(
        'fmcsa',
        result.status,
        result.source,
        records.length > 0 ? formatNumber(records.length) + ' inspection' + (records.length === 1 ? '' : 's') : undefined,
      );
      header.setIdentifiers(keyIdentifiers(records));
      where.fill(renderWhereSeen(records));
      if (result.status === 'unavailable' && result.note) {
        where.root.append(el('p', { class: 'warn' }, result.note));
      }
      if (records.length === 0) {
        summary.drop();
        timeline.drop();
        links.drop();
        log.drop();
        carriers.drop();
        ledger.set('plates', 'miss', null, 'No plates to check');
        return;
      }
      summaryRecords = records;
      refreshSummary();
      timeline.fill(renderTimeline(records));
      log.fill(renderRoadsideLog(records));
      const carrierBlock = renderCarriers(records);
      if (carrierBlock) carriers.fill(carrierBlock);
      else carriers.drop();
    }),
  );

  void Promise.all([commercial, handles.plateLinks.catch(() => [])]).then(
    live(([result, plateLinks]) => {
      const records = result.data ?? [];
      if (records.length === 0) return;
      links.fill(renderConnections(records, plateLinks));
      summaryPlates = plateLinks;
      refreshSummary();
      const shared = linkedVins(vin, plateLinks).length;
      ledger.set('plates', plateLinks.length > 0 ? 'hit' : 'miss', null, shared > 0 ? formatNumber(shared) + ' other VIN' + (shared === 1 ? '' : 's') : 'No other VINs');
    }),
  );

  // Standing of the latest carrier feeds the summary flags.
  void commercial.then(
    live((result) => {
      const latest = (result.data ?? []).find((record) => record.carrierDotNumber);
      if (!latest?.carrierDotNumber) return;
      const name = latest.carrierLegalName ?? latest.carrierDbaName ?? 'USDOT ' + latest.carrierDotNumber;
      const docket =
        latest.carrierDocketPrefix && latest.carrierDocketNumber
          ? latest.carrierDocketPrefix + latest.carrierDocketNumber.padStart(6, '0')
          : null;
      void getCarrierStanding(latest.carrierDotNumber, docket).then(
        live((standing) => {
          if (!standing) return;
          summaryExtra = standingFlags(name, standing);
          if (summaryShown) refreshSummary();
        }),
      );
    }),
  );

  const guided = handles.guidedLinks.catch((): GuidedLink[] => []);
  void guided.then(live((guidedLinks) => checks.replaceChildren(officialChecks(guidedLinks))));

  void Promise.all([settle(handles.recalls, 'NHTSA Recalls'), guided]).then(
    live(([result, guidedLinks]) => {
      ledger.set('recalls', result.status, result.source, result.status === 'hit' ? formatNumber(result.data?.length ?? 0) + ' campaigns' : undefined);
      recallPanel.fill(renderRecalls(result, findLinks(guidedLinks, 'oem-recall')[0]));
    }),
  );

  void settle(handles.complaints, 'NHTSA Complaints').then(
    live((result) => {
      ledger.set('complaints', result.status, result.source, result.status === 'hit' ? formatNumber(result.data?.totalForVehicleLine ?? 0) + ' on model line' : undefined);
      complaintPanel.fill(renderComplaints(result));
    }),
  );

  void Promise.all([settle(handles.nyInspections, 'NY State inspections'), guided]).then(
    live(([result, guidedLinks]) => {
      ledger.set('ny', result.status, result.source, result.status === 'hit' ? formatNumber(result.data?.length ?? 0) + ' readings' : undefined);
      if (result.status === 'hit' && (result.data?.length ?? 0) > 0) {
        odometer.fill(renderOdometer(result, findLinks(guidedLinks, 'state-emissions')));
      } else {
        odometer.drop();
      }
    }),
  );
}
