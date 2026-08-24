/** Section 8 — factory warranty estimate: coverage table with remaining bars. */

import type { SectionResult, WarrantyCoverageRow, WarrantyEstimate } from '../lib/types';
import { el, formatNumber } from './dom';

function meter(remaining: number, term: number, label: string): HTMLElement {
  const percent = Math.max(0, Math.min(100, (remaining / term) * 100));
  return el(
    'div',
    { class: 'meter' },
    el(
      'div',
      { class: 'meter__track' },
      el('div', { class: 'meter__fill', style: `width:${percent.toFixed(1)}%` }),
    ),
    el('span', { class: 'meter__label' }, label),
  );
}

function remainingCell(row: WarrantyCoverageRow): HTMLElement {
  const hasMonths = row.estRemainingMonths !== null && row.termMonths > 0;
  const hasMiles = row.estRemainingMiles !== null && row.termMiles > 0;
  if (!hasMonths && !hasMiles) {
    return el('td', {}, el('span', { class: 'expired' }, row.note ?? 'Expired'));
  }
  const bars = el('div', { class: 'warranty-bars' });
  if (hasMonths && row.estRemainingMonths !== null) {
    bars.append(
      meter(
        row.estRemainingMonths,
        row.termMonths,
        `~${formatNumber(row.estRemainingMonths)} mo left`,
      ),
    );
  }
  if (hasMiles && row.estRemainingMiles !== null) {
    bars.append(
      meter(
        row.estRemainingMiles,
        row.termMiles,
        `~${formatNumber(row.estRemainingMiles)} mi left`,
      ),
    );
  }
  const cell = el('td', {}, bars);
  if (row.note) {
    cell.append(el('div', { class: 'note', style: 'margin-top:0.35rem' }, row.note));
  }
  return cell;
}

export function renderWarranty(
  result: SectionResult<WarrantyEstimate>,
): HTMLElement {
  if (result.status !== 'hit' || !result.data) {
    return el(
      'p',
      { class: 'note' },
      result.note ?? 'No factory warranty terms on file for this make.',
    );
  }

  const estimate = result.data;
  const rows = estimate.rows.map((row) =>
    el(
      'tr',
      {},
      el('td', {}, el('strong', {}, row.coverage)),
      el(
        'td',
        { class: 'num' },
        `${formatNumber(row.termMonths)} mo / ${formatNumber(row.termMiles)} mi`,
      ),
      remainingCell(row),
    ),
  );

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'table-scroll' },
      el(
        'table',
        { class: 'data-table warranty-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { scope: 'col' }, 'Coverage'),
            el('th', { scope: 'col' }, 'Factory term'),
            el('th', { scope: 'col' }, 'Estimated remaining'),
          ),
        ),
        el('tbody', {}, ...rows),
      ),
    ),
    el(
      'p',
      { class: 'assumption' },
      `${estimate.assumptionNote} `,
      'These are estimates — any dealer of the brand can confirm exact ' +
      'coverage dates from the VIN, free.',
    ),
  );
}
