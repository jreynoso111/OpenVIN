/**
 * Report orchestrator: persistent identity + summary band, tabbed detail
 * panels. Every section stays mounted and hydrates as promises resolve,
 * regardless of which tab is visible.
 */

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
import { el, revealOnce } from './dom';
import { createSection, type SectionFrame, type SectionMeta } from './frame';
import { renderFuel } from './fuel';
import { renderIdentity } from './identity';
import { findLink, findLinks, renderOfficialRecords, renderRecordsElsewhere } from './links';
import { renderOdometer } from './odometer';
import { createOverview } from './overview';
import { renderRecalls } from './recalls';
import { renderSafety } from './safety';
import {
  cardsSkeleton,
  chartSkeleton,
  identitySkeleton,
  linesSkeleton,
  rowsSkeleton,
} from './skeleton';
import {
  complaintsTileState,
  createSummaryBand,
  jumpToSection,
  odometerTileState,
  officialTileState,
  recallsTileState,
  safetyTileState,
  warrantyTileState,
} from './summary';
import { createTabs } from './tabs';
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

/** Which tab owns each detail section (tile clicks switch tab, then scroll). */
const TAB_FOR_SECTION: Readonly<Record<string, string>> = {
  recalls: 'federal',
  complaints: 'federal',
  safety: 'federal',
  odometer: 'records',
  warranty: 'records',
  'fuel-economy': 'records',
  'official-records': 'official',
  'records-elsewhere': 'records',
  coverage: 'official',
};

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
    title: 'NHTSA complaint records',
    skeleton: rowsSkeleton(2),
  });
  const safety = createSection({
    id: 'safety',
    title: 'Crash-test ratings',
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
    skeleton: linesSkeleton(5),
  });
  const coverage = createCoveragePanel([
    { id: 'identity', name: 'Vehicle identity' },
    { id: 'official-records', name: 'Title, salvage & theft' },
    { id: 'recalls', name: 'Recall campaigns' },
    { id: 'complaints', name: 'NHTSA complaint reports' },
    { id: 'safety', name: 'Crash-test ratings' },
    { id: 'odometer', name: 'Odometer history' },
    { id: 'fuel-economy', name: 'Fuel economy' },
    { id: 'warranty', name: 'Warranty estimate' },
    { id: 'records-elsewhere', name: 'State, auction & service records' },
  ]);

  const tabs = createTabs(
    [
      { id: 'overview', label: 'Overview' },
      { id: 'federal', label: 'Federal records' },
      { id: 'records', label: 'State & history' },
      { id: 'official', label: 'Official checks' },
    ],
    'overview',
    'vertical',
  );

  const navigate = (sectionId: string): void => {
    tabs.activate(TAB_FOR_SECTION[sectionId] ?? 'overview');
    jumpToSection(sectionId);
  };

  const summary = createSummaryBand(navigate);
  const overview = createOverview(() => navigate('recalls'));
  identity.root.classList.add('section--identity');

  tabs.panel('overview').append(overview.root);
  const safetyPanel = tabs.panel('federal');
  safetyPanel.classList.add('report-grid');
  safetyPanel.append(recalls.root, complaints.root, safety.root);
  const recordsPanel = tabs.panel('records');
  recordsPanel.classList.add('report-grid');
  warranty.root.classList.add('section--half');
  fuel.root.classList.add('section--half');
  recordsPanel.append(odometer.root, warranty.root, fuel.root, elsewhere.root);
  const officialPanel = tabs.panel('official');
  officialPanel.classList.add('report-grid');
  officialPanel.append(official.root, coverage.root);

  const container = el('div', { class: 'report container' });
  const navigation = el(
    'aside',
    { class: 'report-nav', 'aria-label': 'Vehicle report navigation' },
    el('p', { class: 'report-nav__eyebrow' }, 'FILE SECTIONS'),
    tabs.control,
  );
  const workspace = el(
    'div',
    { class: 'report-workbench' },
    navigation,
    tabs.panels,
  );
  [identity.root, summary.root, workspace].forEach((target, index) => {
    revealOnce(target);
    target.style.animationDelay = `${index * STAGGER_MS}ms`;
  });
  container.append(identity.root, summary.root, workspace);
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
    summary.set('official-records', officialTileState(links));
    overview.setOfficial(links);

    const elsewhereMeta: SectionMeta = {
      status: 'guided',
      source: { name: 'Official portals — lookups run on their sites' },
    };
    elsewhere.hydrate(elsewhereMeta, renderRecordsElsewhere(links));
    coverage.setRow('records-elsewhere', 'guided', elsewhereMeta.source.name);
  });

  void Promise.all([settle(handles.recalls, 'NHTSA Recalls'), guidedLinks]).then(
    ([result, links]) => {
      if (!callbacks.isCurrent()) return;
      const content = renderRecalls(result, findLink(links, 'oem-recall'));
      hydrate(recalls, 'recalls', result, content);
      summary.set('recalls', recallsTileState(result));
      overview.setRecalls(result);
    },
  );

  void settle(handles.complaints, 'NHTSA Complaints').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(complaints, 'complaints', result, renderComplaints(result));
    summary.set('complaints', complaintsTileState(result));
  });

  void settle(handles.safety, 'NHTSA NCAP').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(safety, 'safety', result, renderSafety(result));
    summary.set('safety', safetyTileState(result));
  });

  void Promise.all([
    settle(handles.nyInspections, 'NY State inspections'),
    guidedLinks,
  ]).then(([result, links]) => {
    if (!callbacks.isCurrent()) return;
    const content = renderOdometer(result, findLinks(links, 'state-emissions'));
    hydrate(odometer, 'odometer', result, content);
    summary.set('odometer', odometerTileState(result));
    overview.setOdometer(result);
  });

  void settle(handles.fuelEconomy, 'fueleconomy.gov').then((result) => {
    hydrate(fuel, 'fuel-economy', result, renderFuel(result));
  });

  void settle(handles.warranty, 'High View estimate').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(warranty, 'warranty', result, renderWarranty(result));
    summary.set('warranty', warrantyTileState(result));
  });
}
