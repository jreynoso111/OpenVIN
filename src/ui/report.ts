/**
 * Report orchestrator: one operational vehicle file with visible activity,
 * source freshness, and all detailed records grouped on a single page.
 */

import type {
  CommercialInspection,
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
import { renderCommercialInspections } from './commercial';
import { createCoveragePanel } from './coverage';
import { el, revealOnce } from './dom';
import { createSection, type SectionFrame, type SectionMeta } from './frame';
import { renderFuel } from './fuel';
import { renderIdentity } from './identity';
import { findLink, findLinks, renderOfficialRecords, renderRecordsElsewhere } from './links';
import { renderOdometer } from './odometer';
import { createOperationsSnapshot } from './operations';
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
  commercialInspectionsTileState,
  createSummaryBand,
  jumpToSection,
  odometerTileState,
  officialTileState,
  recallsTileState,
  safetyTileState,
  warrantyTileState,
} from './summary';
import { renderWarranty } from './warranty';

/** Mirror of the data layer's startReport() return shape (src/lib/report). */
export interface ReportHandles {
  readonly identity: Promise<SectionResult<VehicleIdentity>>;
  readonly recalls: Promise<SectionResult<RecallCampaign[]>>;
  readonly complaints: Promise<SectionResult<ComplaintsSummary>>;
  readonly safety: Promise<SectionResult<SafetyRating>>;
  readonly nyInspections: Promise<SectionResult<OdometerReading[]>>;
  readonly commercialInspections: Promise<SectionResult<CommercialInspection[]>>;
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

function recordGroup(
  id: string,
  number: string,
  title: string,
  description: string,
  content: HTMLElement,
): HTMLElement {
  const headingId = `${id}-heading`;
  return el(
    'section',
    { class: 'record-group', id, 'aria-labelledby': headingId },
    el(
      'div',
      { class: 'record-group__head' },
      el('p', { class: 'record-group__number' }, number),
      el(
        'div',
        {},
        el('h2', { class: 'record-group__title', id: headingId, tabindex: '-1' }, title),
        el('p', { class: 'record-group__description' }, description),
      ),
    ),
    content,
  );
}

function navigationLink(label: string, target: string): HTMLAnchorElement {
  return el(
    'a',
    {
      class: 'ops-nav__link',
      href: `#${target}`,
      onclick: (event: Event) => {
        event.preventDefault();
        jumpToSection(target);
      },
    },
    label,
  );
}

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
  const commercial = createSection({
    id: 'commercial-inspections',
    title: 'FMCSA commercial roadside inspections',
    skeleton: rowsSkeleton(3),
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
    { id: 'commercial-inspections', name: 'Commercial roadside history' },
    { id: 'safety', name: 'Crash-test ratings' },
    { id: 'odometer', name: 'Odometer history' },
    { id: 'fuel-economy', name: 'Fuel economy' },
    { id: 'warranty', name: 'Warranty estimate' },
    { id: 'records-elsewhere', name: 'State, auction & service records' },
  ]);

  const operations = createOperationsSnapshot();
  const summary = createSummaryBand((sectionId) => jumpToSection(sectionId));
  identity.root.classList.add('section--identity');

  recalls.root.classList.add('section--half');
  complaints.root.classList.add('section--half');
  safety.root.classList.add('section--half');
  odometer.root.classList.add('section--full');
  commercial.root.classList.add('section--full');
  warranty.root.classList.add('section--half');
  fuel.root.classList.add('section--half');
  elsewhere.root.classList.add('section--full');
  official.root.classList.add('section--half');
  coverage.root.classList.add('section--half');

  const commercialGroup = recordGroup(
    'commercial-records',
    '01 / COMMERCIAL FLEET',
    'Commercial roadside history',
    'FMCSA joins the exact VIN to inspection, plate, carrier and vehicle-level violation records. Inspections may be reported by state or federal enforcement; locations are historical, not live tracking.',
    el('div', { class: 'report-grid' }, commercial.root),
  );
  const federalGroup = recordGroup(
    'federal-records',
    '02 / FEDERAL',
    'Safety & federal records',
    'NHTSA results may describe the model line. Complaint matches use an 11-character VIN prefix.',
    el('div', { class: 'report-grid' }, recalls.root, complaints.root, safety.root),
  );
  const stateGroup = recordGroup(
    'state-records',
    '03 / STATE + VEHICLE',
    'Mileage, specifications & other sources',
    'New York is the only state vehicle-safety and emissions dataset connected today. FMCSA also includes reported commercial roadside inspections across states; other state VIN portals remain manual.',
    el('div', { class: 'report-grid' }, odometer.root, warranty.root, fuel.root, elsewhere.root),
  );
  const officialGroup = recordGroup(
    'official-checks',
    '04 / VERIFICATION',
    'Title, brand & theft checks',
    'These official or authorized lookups open on their own sites; their results are not imported into High View.',
    el('div', { class: 'report-grid' }, official.root, coverage.root),
  );

  const container = el('div', { class: 'report container' });
  const navigation = el(
    'nav',
    { class: 'ops-navigation', 'aria-label': 'Vehicle file sections' },
    el('p', { class: 'ops-navigation__label' }, 'JUMP TO'),
    navigationLink('Latest activity', 'latest-activity'),
    navigationLink('Source checks', 'source-status'),
    navigationLink('Roadside history', 'commercial-records'),
    navigationLink('Federal', 'federal-records'),
    navigationLink('State & history', 'state-records'),
    navigationLink('Official checks', 'official-records'),
    navigationLink('Coverage limits', 'coverage'),
  );
  [identity.root, summary.root, operations.root].forEach((target, index) => {
    revealOnce(target);
    target.style.animationDelay = `${index * STAGGER_MS}ms`;
  });
  container.append(
    identity.root,
    summary.root,
    operations.root,
    navigation,
    commercialGroup,
    federalGroup,
    stateGroup,
    officialGroup,
  );
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
    operations.setIdentity(result);
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
    operations.setGuided(links);

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
      operations.setRecalls(result);
      summary.set('recalls', recallsTileState(result));
    },
  );

  void settle(handles.complaints, 'NHTSA Complaints').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(complaints, 'complaints', result, renderComplaints(result));
    operations.setComplaints(result);
    summary.set('complaints', complaintsTileState(result));
  });

  void settle(handles.safety, 'NHTSA NCAP').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(safety, 'safety', result, renderSafety(result));
    operations.setSafety(result);
    summary.set('safety', safetyTileState(result));
  });

  void Promise.all([
    settle(handles.nyInspections, 'NY State inspections'),
    guidedLinks,
  ]).then(([result, links]) => {
    if (!callbacks.isCurrent()) return;
    const content = renderOdometer(result, findLinks(links, 'state-emissions'));
    hydrate(odometer, 'odometer', result, content);
    operations.setOdometer(result);
    summary.set('odometer', odometerTileState(result));
  });

  void settle(handles.commercialInspections, 'FMCSA roadside inspections').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(
      commercial,
      'commercial-inspections',
      result,
      renderCommercialInspections(result),
    );
    operations.setCommercialInspections(result);
    summary.set('commercial-inspections', commercialInspectionsTileState(result));
  });

  void settle(handles.fuelEconomy, 'fueleconomy.gov').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(fuel, 'fuel-economy', result, renderFuel(result));
    operations.setFuelEconomy(result);
  });

  void settle(handles.warranty, 'High View estimate').then((result) => {
    if (!callbacks.isCurrent()) return;
    hydrate(warranty, 'warranty', result, renderWarranty(result));
    summary.set('warranty', warrantyTileState(result));
  });
}
