/** Report orchestrator: builds the section skeletons, hydrates as data lands. */

import type {
  ComplaintsSummary,
  FuelEconomy,
  GuidedLink,
  OdometerReading,
  RecallCampaign,
  SafetyRating,
  SectionResult,
  VehicleIdentity,
  WarrantyEstimate,
} from '../lib/types';
import { renderComplaints } from './complaints';
import { createCoveragePanel } from './coverage';
import { el } from './dom';
import { createSection, type SectionFrame, type SectionMeta } from './frame';
import { renderFuel } from './fuel';
import { renderIdentity } from './identity';
import { findLink, findLinks, renderOfficialRecords, renderRecordsElsewhere } from './links';
import { renderOdometer } from './odometer';
import { renderRecalls } from './recalls';
import { renderSafety } from './safety';
import {
  cardsSkeleton,
  chartSkeleton,
  identitySkeleton,
  linesSkeleton,
  rowsSkeleton,
} from './skeleton';
import { renderWarranty } from './warranty';

/** Mirror of the data layer's startReport() return shape (src/lib/report). */
export interface ReportHandles {
  readonly identity: Promise<SectionResult<VehicleIdentity>>;
  readonly recalls: Promise<SectionResult<RecallCampaign[]>>;
  readonly complaints: Promise<SectionResult<ComplaintsSummary>>;
  readonly safety: Promise<SectionResult<SafetyRating>>;
  readonly nyInspections: Promise<SectionResult<OdometerReading[]>>;
  readonly fuelEconomy: Promise<SectionResult<FuelEconomy>>;
  readonly warranty: Promise<SectionResult<WarrantyEstimate>>;
  readonly guidedLinks: Promise<GuidedLink[]>;
}

export interface ReportCallbacks {
  readonly onVehicleName: (name: string) => void;
  /** False once this report has been superseded — stale hydrations must no-op. */
  readonly isCurrent: () => boolean;
}

const STAGGER_MS = 55;

function unavailableMeta(sourceName: string): SectionMeta {
  return {
    status: 'unavailable',
    source: { name: sourceName },
    note: 'Something went wrong loading this section.',
  };
}

/** Contract says section promises always resolve; belt-and-braces anyway. */
function settle<T>(
  promise: Promise<SectionResult<T>>,
  sourceName: string,
): Promise<SectionResult<T>> {
  return promise.catch(() => unavailableMeta(sourceName) as SectionResult<T>);
}

export function renderReport(
  main: HTMLElement,
  handles: ReportHandles,
  callbacks: ReportCallbacks,
): void {
  const identity = createSection({
    id: 'identity',
    title: 'Vehicle identity',
    hideTitle: true,
    skeleton: identitySkeleton(),
  });
  const official = createSection({
    id: 'official-records',
    title: 'Check the official records',
    skeleton: cardsSkeleton(2),
  });
  const recalls = createSection({
    id: 'recalls',
    title: 'Recalls',
    skeleton: rowsSkeleton(3),
  });
  const complaints = createSection({
    id: 'complaints',
    title: 'Owner complaints',
    skeleton: rowsSkeleton(2),
  });
  const safety = createSection({
    id: 'safety',
    title: 'Crash-test safety',
    skeleton: linesSkeleton(4),
  });
  const odometer = createSection({
    id: 'odometer',
    title: 'Odometer history',
    skeleton: chartSkeleton(),
  });
  const fuel = createSection({
    id: 'fuel-economy',
    title: 'Fuel economy',
    skeleton: linesSkeleton(2),
  });
  const warranty = createSection({
    id: 'warranty',
    title: 'Factory warranty',
    skeleton: linesSkeleton(3),
  });
  const elsewhere = createSection({
    id: 'records-elsewhere',
    title: 'Records elsewhere',
    skeleton: cardsSkeleton(4),
  });
  const coverage = createCoveragePanel([
    { id: 'identity', name: 'Vehicle identity' },
    { id: 'official-records', name: 'Title, salvage & theft' },
    { id: 'recalls', name: 'Recall campaigns' },
    { id: 'complaints', name: 'Owner complaints' },
    { id: 'safety', name: 'Crash-test ratings' },
    { id: 'odometer', name: 'Odometer history' },
    { id: 'fuel-economy', name: 'Fuel economy' },
    { id: 'warranty', name: 'Warranty estimate' },
    { id: 'records-elsewhere', name: 'State, auction & service records' },
  ]);

  const sections: readonly HTMLElement[] = [
    identity.root,
    official.root,
    recalls.root,
    complaints.root,
    safety.root,
    odometer.root,
    fuel.root,
    warranty.root,
    elsewhere.root,
    coverage.root,
  ];
  const container = el('div', { class: 'report container' });
  sections.forEach((section, index) => {
    section.classList.add('reveal');
    section.style.animationDelay = `${index * STAGGER_MS}ms`;
    container.append(section);
  });
  main.replaceChildren(container);

  const hydrate = <T>(
    frame: SectionFrame,
    coverageId: string,
    result: SectionResult<T>,
    content: Node | null,
  ): void => {
    if (!callbacks.isCurrent()) return;
    frame.hydrate(result, content);
    coverage.setRow(coverageId, result.status, result.source.name);
  };

  const guidedLinks: Promise<GuidedLink[]> = handles.guidedLinks.catch(() => []);

  void settle(handles.identity, 'NHTSA vPIC').then((result) => {
    if (!callbacks.isCurrent()) return;
    const rendered = renderIdentity(result);
    hydrate(identity, 'identity', result, rendered.content);
    callbacks.onVehicleName(rendered.vehicleName ?? '');
  });

  void guidedLinks.then((links) => {
    if (!callbacks.isCurrent()) return;
    const meta: SectionMeta = {
      status: 'guided',
      source: { name: 'NMVTIS (vehiclehistory.gov) & NICB VINCheck' },
    };
    official.hydrate(meta, renderOfficialRecords(links));
    coverage.setRow('official-records', 'guided', meta.source.name);

    const elsewhereMeta: SectionMeta = {
      status: 'guided',
      source: { name: 'Official portals — lookups run on their sites' },
    };
    elsewhere.hydrate(elsewhereMeta, renderRecordsElsewhere(links));
    coverage.setRow('records-elsewhere', 'guided', elsewhereMeta.source.name);
  });

  void Promise.all([settle(handles.recalls, 'NHTSA Recalls'), guidedLinks]).then(
    ([result, links]) => {
      const content = renderRecalls(result, findLink(links, 'oem-recall'));
      hydrate(recalls, 'recalls', result, content);
    },
  );

  void settle(handles.complaints, 'NHTSA Complaints').then((result) => {
    hydrate(complaints, 'complaints', result, renderComplaints(result));
  });

  void settle(handles.safety, 'NHTSA NCAP').then((result) => {
    hydrate(safety, 'safety', result, renderSafety(result));
  });

  void Promise.all([
    settle(handles.nyInspections, 'NY State inspections'),
    guidedLinks,
  ]).then(([result, links]) => {
    const content = renderOdometer(result, findLinks(links, 'state-emissions'));
    hydrate(odometer, 'odometer', result, content);
  });

  void settle(handles.fuelEconomy, 'fueleconomy.gov').then((result) => {
    hydrate(fuel, 'fuel-economy', result, renderFuel(result));
  });

  void settle(handles.warranty, 'OpenVIN estimate').then((result) => {
    hydrate(warranty, 'warranty', result, renderWarranty(result));
  });
}
