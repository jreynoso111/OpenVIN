/** OpenVIN entry point — URL state and view wiring only. */

import './styles/tokens.css';
import './styles/global.css';
import './styles/report.css';
import './styles/lists.css';
import './styles/summary.css';
import './styles/tabs.css';
import './styles/workspace.css';
import './styles/viz.css';
import './styles/sections.css';

import { normalizeVin, validateVin } from './lib/vin';
import { startReport } from './lib/report';
import { renderReport, type ReportHandles } from './ui/report';
import { mountShell, renderHero } from './ui/shell';

const BASE_TITLE = 'High View — Vehicle Record Search';
const GENERIC_VIN_ERROR =
  'That doesn’t look like a valid 17-character VIN. Check for typos — ' +
  'VINs never contain the letters I, O, or Q.';
const VIN_SHAPE = /^[A-HJ-NPR-Z0-9]{17}$/;

/* ---------- Defensive adapters over the data-layer VIN utils ---------- */

function safeNormalize(raw: string): string {
  try {
    const normalized: unknown = normalizeVin(raw);
    if (typeof normalized === 'string') return normalized;
  } catch {
    /* fall through to local normalization */
  }
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

function firstString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** Interpret validateVin()'s verdict without assuming its exact shape. */
function interpretVerdict(verdict: unknown, vin: string): string | null {
  if (verdict === null || verdict === undefined || verdict === true) return null;
  if (verdict === false) return GENERIC_VIN_ERROR;
  if (typeof verdict === 'string') {
    // Either the normalized VIN echoed back (valid) or an error message.
    return VIN_SHAPE.test(verdict) ? null : verdict;
  }
  if (Array.isArray(verdict)) {
    if (verdict.length === 0) return null;
    return firstString(verdict) ?? GENERIC_VIN_ERROR;
  }
  if (typeof verdict === 'object') {
    const record = verdict as Record<string, unknown>;
    const flags = [record['valid'], record['ok'], record['isValid']];
    const isValid = flags.some((flag) => flag === true);
    if (isValid) return null;
    if (flags.some((flag) => flag === false)) {
      return (
        firstString([record['message'], record['error'], record['reason']]) ??
        GENERIC_VIN_ERROR
      );
    }
  }
  // Unknown shape: fall back to a local structural check.
  return VIN_SHAPE.test(vin) ? null : GENERIC_VIN_ERROR;
}

function validationError(vin: string): string | null {
  try {
    return interpretVerdict(validateVin(vin) as unknown, vin);
  } catch (error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    return GENERIC_VIN_ERROR;
  }
}

/* ---------- URL state (relative — GitHub Pages base-path safe) ---------- */

function readVinFromUrl(): string | null {
  const raw = new URL(window.location.href).searchParams.get('vin');
  if (!raw || !raw.trim()) return null;
  return safeNormalize(raw);
}

function pushVin(vin: string | null): void {
  const url = new URL(window.location.href);
  if (vin) {
    url.searchParams.set('vin', vin);
  } else {
    url.searchParams.delete('vin');
  }
  window.history.pushState({ vin }, '', url);
}

/* ---------- Views ---------- */

const app = document.getElementById('app');
if (!app) throw new Error('High View: #app mount point is missing');

let currentVin: string | null | undefined;
/** Bumped on every view change; in-flight report callbacks from older views no-op. */
let reportGeneration = 0;

const shell = mountShell(app, {
  onHome: () => {
    pushVin(null);
    route();
  },
  onNewSearch: () => {
    pushVin(null);
    route();
  },
});

function submitVin(raw: string, showError: (message: string) => void): void {
  const vin = safeNormalize(raw);
  if (!vin) {
    showError('Enter a VIN to run a report.');
    return;
  }
  const error = validationError(vin);
  if (error) {
    showError(error);
    return;
  }
  pushVin(vin);
  route();
}

function showLanding(initialError?: string): void {
  reportGeneration += 1;
  currentVin = null;
  document.title = BASE_TITLE;
  shell.showLandingHeader();
  const hero = renderHero((raw) => submitVin(raw, hero.showError));
  shell.main.replaceChildren(hero.root);
  if (initialError) hero.showError(initialError);
}

function showReport(vin: string): void {
  reportGeneration += 1;
  const generation = reportGeneration;
  currentVin = vin;
  document.title = `${vin} — High View`;
  shell.showReportHeader(vin);
  const handles = startReport(vin) as ReportHandles;
  renderReport(shell.main, handles, {
    isCurrent: () => generation === reportGeneration,
    onVehicleName: (name) => {
      shell.setHeaderVehicle(name);
      document.title = name ? `${name} — High View` : `${vin} — High View`;
    },
  });
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

function route(): void {
  const vin = readVinFromUrl();
  if (vin === currentVin) return;
  if (!vin) {
    showLanding();
    return;
  }
  const error = validationError(vin);
  if (error) {
    showLanding(error);
    return;
  }
  showReport(vin);
}

window.addEventListener('popstate', route);
route();
