/**
 * At-a-glance summary band — stat tiles under the identity header.
 * Each tile hydrates from the same section promise as its detail section
 * and jump-scrolls to it on click (focus moves to the section heading).
 */

import type {
  CommercialInspection,
  ComplaintsSummary,
  GuidedLink,
  OdometerReading,
  RecallCampaign,
  SafetyRating,
  SectionResult,
  WarrantyCoverageRow,
  WarrantyEstimate,
} from '../lib/types';
import { clear, el, formatDate, formatNumber } from './dom';
import { hasRollback, sortReadings } from './odometer';
import { tileSkeleton } from './skeleton';

const MAX_STARS = 5;
const MIN_OK_STARS = 4;

export type TileTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';

interface TileBadge {
  readonly label: string;
  readonly tone: 'danger' | 'warn' | 'accent' | 'neutral';
}

export interface TileState {
  readonly tone: TileTone;
  /** 'number' renders large numerals; 'text' a phrase; 'stars' glyphs. */
  readonly kind: 'number' | 'text' | 'stars';
  readonly value: string;
  /** Accessible label for glyph values (stars). */
  readonly valueLabel?: string;
  readonly detail: string;
  readonly badges?: readonly TileBadge[];
}

/** Tile keys double as the ids of the sections they scroll to. */
export type SummaryTarget =
  | 'recalls'
  | 'complaints'
  | 'safety'
  | 'odometer'
  | 'commercial-inspections'
  | 'warranty'
  | 'official-records';

export interface SummaryBand {
  readonly root: HTMLElement;
  /** Swap a tile's skeleton for its hydrated state. Idempotent per tile. */
  set(target: SummaryTarget, state: TileState): void;
}

const TILE_SPECS: readonly { readonly target: SummaryTarget; readonly label: string }[] = [
  { target: 'recalls', label: 'Recalls' },
  { target: 'complaints', label: 'Complaints' },
  { target: 'safety', label: 'Safety' },
  { target: 'odometer', label: 'Odometer' },
  { target: 'commercial-inspections', label: 'Roadside' },
  { target: 'warranty', label: 'Warranty' },
  { target: 'official-records', label: 'Official checks' },
];

/** Scroll to a section and move focus to its heading (tabindex="-1"). */
export function jumpToSection(id: string): void {
  const section = document.getElementById(id);
  if (!section) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  const heading = document.getElementById(`${id}-heading`);
  if (heading instanceof HTMLElement) heading.focus({ preventScroll: true });
}

function tileContent(label: string, state: TileState): readonly Node[] {
  const valueClass =
    state.kind === 'text'
      ? 'tile__value tile__value--text'
      : state.kind === 'stars'
        ? 'tile__value tile__value--stars'
        : 'tile__value';
  const value =
    state.kind === 'stars'
      ? el(
          'span',
          { class: valueClass, role: 'img', 'aria-label': state.valueLabel ?? state.value },
          state.value,
        )
      : el('span', { class: valueClass }, state.value);
  const nodes: Node[] = [
    el(
      'span',
      { class: 'tile__label' },
      label,
      el('span', { class: 'visually-hidden' }, ' — view details'),
    ),
    value,
    el('span', { class: 'tile__detail' }, state.detail),
  ];
  if (state.badges && state.badges.length > 0) {
    nodes.push(
      el(
        'span',
        { class: 'tile__badges' },
        ...state.badges.map((badge) =>
          el('span', { class: `badge badge--${badge.tone}` }, badge.label),
        ),
      ),
    );
  }
  return nodes;
}

export function createSummaryBand(
  onNavigate: (target: SummaryTarget) => void,
): SummaryBand {
  const tiles = new Map<SummaryTarget, { button: HTMLButtonElement; label: string }>();
  const root = el('section', {
    class: 'summary-band',
    'aria-label': 'Report at a glance',
  });

  for (const spec of TILE_SPECS) {
    const button = el(
      'button',
      {
        class: 'tile',
        type: 'button',
        disabled: true,
        'data-tone': 'neutral',
        onclick: () => onNavigate(spec.target),
      },
      el('span', { class: 'tile__label' }, spec.label),
      tileSkeleton(),
    );
    tiles.set(spec.target, { button, label: spec.label });
    root.append(button);
  }

  return {
    root,
    set(target: SummaryTarget, state: TileState): void {
      const tile = tiles.get(target);
      if (!tile) return;
      clear(tile.button);
      tile.button.append(...tileContent(tile.label, state));
      tile.button.setAttribute('data-tone', state.tone);
      tile.button.disabled = false;
    },
  };
}

/* ---------- Per-section tile states ---------- */

function unavailableState(): TileState {
  return {
    tone: 'warn',
    kind: 'text',
    value: '—',
    detail: 'Source unavailable — retried',
  };
}

export function recallsTileState(result: SectionResult<RecallCampaign[]>): TileState {
  if (result.status === 'unavailable') return unavailableState();
  const campaigns = result.status === 'hit' && result.data ? result.data : [];
  if (campaigns.length === 0) {
    return {
      tone: 'ok',
      kind: 'number',
      value: '0',
      detail: 'campaigns for this vehicle line',
    };
  }
  const parkIt = campaigns.some((campaign) => campaign.parkIt);
  const parkOutside = campaigns.some((campaign) => campaign.parkOutSide);
  const hazard = parkIt || parkOutside;
  const hazardLabel = [parkIt ? 'Do not drive' : null, parkOutside ? 'Park outside' : null]
    .filter((part): part is string => part !== null)
    .join(' / ');
  return {
    tone: hazard ? 'danger' : 'warn',
    kind: 'number',
    value: String(campaigns.length),
    detail:
      campaigns.length === 1
        ? 'open campaign for this vehicle line'
        : 'open campaigns for this vehicle line',
    badges: hazard ? [{ label: `⚠ ${hazardLabel}`, tone: 'danger' }] : undefined,
  };
}

export function complaintsTileState(result: SectionResult<ComplaintsSummary>): TileState {
  if (result.status === 'unavailable') return unavailableState();
  if (result.status !== 'hit' || !result.data) {
    return {
      tone: 'neutral',
      kind: 'number',
      value: '0',
      detail: 'federal complaints on file',
    };
  }
  const summary = result.data;
  const badges: TileBadge[] = [];
  if (summary.crashCount > 0) {
    badges.push({ label: `${formatNumber(summary.crashCount)} crash`, tone: 'danger' });
  }
  if (summary.fireCount > 0) {
    badges.push({ label: `${formatNumber(summary.fireCount)} fire`, tone: 'danger' });
  }
  return {
    tone: summary.vinMatches.length > 0 ? 'warn' : 'neutral',
    kind: 'number',
    value: String(summary.vinMatches.length),
    detail: `share this VIN's 11-character prefix · ${formatNumber(summary.totalForVehicleLine)} for the vehicle line`,
    badges: badges.length > 0 ? badges : undefined,
  };
}

export function safetyTileState(result: SectionResult<SafetyRating>): TileState {
  if (result.status === 'unavailable') return unavailableState();
  const rating = result.status === 'hit' && result.data ? result.data.overallRating : null;
  const parsed = rating === null ? NaN : Number.parseInt(rating, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_STARS) {
    return {
      tone: 'neutral',
      kind: 'text',
      value: 'Not rated',
      detail: 'No NCAP crash-test rating published',
    };
  }
  return {
    tone: parsed >= MIN_OK_STARS ? 'ok' : 'neutral',
    kind: 'stars',
    value: '★'.repeat(parsed) + '☆'.repeat(MAX_STARS - parsed),
    valueLabel: `${parsed} out of ${MAX_STARS} stars`,
    detail: 'NCAP overall rating',
  };
}

export function odometerTileState(result: SectionResult<OdometerReading[]>): TileState {
  if (result.status === 'unavailable') return unavailableState();
  if (result.status !== 'hit' || !result.data || result.data.length === 0) {
    return {
      tone: 'neutral',
      kind: 'text',
      value: 'No records',
      detail: 'State-inspection mileage coverage varies by state',
    };
  }
  const readings = sortReadings(result.data);
  const last = readings[readings.length - 1];
  if (!last) return unavailableState();
  if (hasRollback(readings)) {
    return {
      tone: 'danger',
      kind: 'number',
      value: `${formatNumber(last.miles)} mi`,
      detail: 'a later reading is lower than an earlier one',
      badges: [{ label: 'Rollback?', tone: 'danger' }],
    };
  }
  return {
    tone: 'neutral',
    kind: 'number',
    value: `${formatNumber(last.miles)} mi`,
    detail: `last reading · ${formatDate(last.date)}`,
  };
}

export function commercialInspectionsTileState(
  result: SectionResult<CommercialInspection[]>,
): TileState {
  if (result.status === 'unavailable' && !result.data) return unavailableState();
  const records = result.data ?? [];
  if (records.length === 0) {
    return {
      tone: 'neutral',
      kind: 'text',
      value: result.status === 'miss' ? 'No match' : 'No records',
      detail: 'FMCSA VIN-matched inspections',
    };
  }
  const newest = records.find((record) => record.date !== null);
  const outOfServiceCount = records.filter((record) => (record.vehicleOutOfService ?? 0) > 0).length;
  const detail = [
    newest?.date ? 'latest · ' + formatDate(newest.date) : 'date unavailable',
    outOfServiceCount > 0 ? formatNumber(outOfServiceCount) + ' vehicle OOS event(s) in history' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return {
    tone: outOfServiceCount > 0 ? 'warn' : 'neutral',
    kind: 'number',
    value: formatNumber(records.length),
    detail,
    badges: result.status === 'unavailable'
      ? [{ label: 'Partial source response', tone: 'warn' }]
      : outOfServiceCount > 0
        ? [{ label: 'Past vehicle OOS', tone: 'warn' }]
        : undefined,
  };
}

function coverageEndYear(
  estimate: WarrantyEstimate,
  row: WarrantyCoverageRow,
): number | null {
  const start = new Date(estimate.assumedInServiceDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + row.termMonths);
  return end.getFullYear();
}

export function warrantyTileState(result: SectionResult<WarrantyEstimate>): TileState {
  if (result.status === 'unavailable') return unavailableState();
  if (result.status !== 'hit' || !result.data) {
    return {
      tone: 'neutral',
      kind: 'text',
      value: 'No estimate',
      detail: 'No factory warranty terms on file for this make',
    };
  }
  const estimate = result.data;
  const activeByMonths = estimate.rows.filter(
    (row) => row.estRemainingMonths !== null && row.estRemainingMonths > 0,
  );
  if (activeByMonths.length > 0) {
    const dominant =
      activeByMonths.find((row) => /basic/i.test(row.coverage)) ??
      activeByMonths.reduce((best, row) =>
        (row.estRemainingMonths ?? 0) > (best.estRemainingMonths ?? 0) ? row : best,
      );
    const year = coverageEndYear(estimate, dominant);
    const remaining = [
      dominant.estRemainingMonths !== null
        ? `~${formatNumber(dominant.estRemainingMonths)} mo`
        : null,
      dominant.estRemainingMiles !== null
        ? `~${formatNumber(dominant.estRemainingMiles)} mi`
        : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' / ');
    return {
      tone: 'ok',
      kind: 'text',
      value: year !== null ? `${dominant.coverage} ends ~${year}` : `${dominant.coverage} active`,
      detail: remaining ? `${remaining} remaining — estimated` : 'estimated coverage',
    };
  }
  const activeByMiles = estimate.rows.filter(
    (row) => row.estRemainingMiles !== null && row.estRemainingMiles > 0,
  );
  const milesRow = activeByMiles[0];
  if (milesRow && milesRow.estRemainingMiles !== null) {
    return {
      tone: 'ok',
      kind: 'text',
      value: `${milesRow.coverage}: ~${formatNumber(milesRow.estRemainingMiles)} mi left`,
      detail: 'estimate — any dealer can confirm exact dates',
    };
  }
  return {
    tone: 'neutral',
    kind: 'text',
    value: 'Likely expired',
    detail: 'all factory coverage windows have likely passed',
  };
}

export function officialTileState(links: readonly GuidedLink[]): TileState {
  const officialCount = links.filter(
    (link) => link.kind === 'nmvtis' || link.kind === 'nicb',
  ).length;
  if (officialCount === 0) {
    return {
      tone: 'accent',
      kind: 'text',
      value: 'NMVTIS & NICB',
      detail: 'run the official title & theft checks yourself',
    };
  }
  return {
    tone: 'accent',
    kind: 'number',
    value: String(officialCount),
    detail: 'manual checks — NMVTIS title & NICB theft',
  };
}
