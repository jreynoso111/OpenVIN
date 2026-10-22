/** VinOrbits entry point — URL state, pivots and report wiring. */

import './styles/tokens.css';
import './styles/base.css';
import './styles/desk.css';
import './styles/viz.css';
import './styles/insight.css';

import { startReport } from './lib/report';
import { describeQuery, queryFromParams, queryHref, type SearchQuery } from './lib/query';
import { validateVin } from './lib/vin';
import { renderCarrierFile, renderNameResults } from './ui/carrierFile';
import { renderPlateFile } from './ui/plateFile';
import { renderReport, type ReportHandles } from './ui/report';
import { mountShell, rememberSearch } from './ui/shell';

const BASE_TITLE = 'VinOrbits — Vehicle history from public records';

const app = document.getElementById('app');
if (!app) throw new Error('VinOrbits: #app mount point is missing');

let currentKey: string | null | undefined;
/** Bumped on every view change; in-flight callbacks from older views no-op. */
let generation = 0;

function navigate(query: SearchQuery | null): void {
  const url = new URL(window.location.href);
  url.search = query ? queryHref(query) : '';
  window.history.pushState(null, '', url);
  route();
}

const shell = mountShell(app, {
  onHome: () => navigate(null),
  onSearch: (query) => navigate(query),
});

// Every [data-pivot] link is an in-app search; modifier clicks keep browser behavior.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest?.('a[data-pivot]');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const query = queryFromParams(new URL(anchor.href).searchParams);
  if (!query) return;
  event.preventDefault();
  navigate(query);
});

function showFile(query: SearchQuery): void {
  generation += 1;
  const mine = generation;
  const isCurrent = (): boolean => mine === generation;
  shell.showFile(query);
  rememberSearch(query);
  document.title = describeQuery(query) + ' — VinOrbits';

  switch (query.kind) {
    case 'vin': {
      const handles = startReport(query.value) as ReportHandles;
      renderReport(shell.main, handles, {
        isCurrent,
        onVehicleName: (name) => {
          document.title = (name ? name + ' · ' : '') + query.value + ' — VinOrbits';
        },
      }, query.value);
      break;
    }
    case 'plate':
      renderPlateFile(shell.main, query.value, query.state, isCurrent);
      break;
    case 'dot':
    case 'mc':
      renderCarrierFile(shell.main, query.kind, query.value, isCurrent);
      break;
    case 'name':
      renderNameResults(shell.main, query.value, isCurrent);
      break;
  }
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

function route(): void {
  const query = queryFromParams(new URL(window.location.href).searchParams);
  const key = query ? queryHref(query) : null;
  if (key === currentKey) return;
  currentKey = key;
  if (!query || (query.kind === 'vin' && !validateVin(query.value).valid)) {
    generation += 1;
    document.title = BASE_TITLE;
    shell.showLanding();
    return;
  }
  showFile(query);
}

window.addEventListener('popstate', route);
route();
