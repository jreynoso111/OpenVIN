/** Render the Ubuntu-local NHTSA ODI mirror as vehicle-line evidence. */

import type {
  NhtsaCommunication,
  NhtsaInvestigation,
  NhtsaOdiLookup,
} from '../lib/api/nhtsaOdi';
import type { SectionResult } from '../lib/types';
import { el, formatDate, formatDateTime, formatNumber } from './dom';
import { emptyNote } from './panel';

/** Records listed per group, and how many of them start expanded. */
const SHOWN_ROWS = 15;
const OPEN_ROWS = 3;

function startOpen(row: HTMLElement, index: number): HTMLElement {
  if (index < OPEN_ROWS) (row as HTMLDetailsElement).open = true;
  return row;
}

function detail(label: string, value: string | null): HTMLElement | null {
  return value ? el('p', {}, el('strong', {}, label + ': '), value) : null;
}

function communicationRow(record: NhtsaCommunication): HTMLElement {
  return el(
    'details',
    { class: 'mrow' },
    el(
      'summary',
      {},
      el('span', { class: 'mrow__title' }, record.documentId || record.communicationTypes[0] || 'Manufacturer communication'),
      ...record.communicationTypes.slice(0, 2).map((type) => el('span', { class: 'tag', 'data-tone': 'muted' }, type)),
      el('span', { class: 'mrow__date' }, formatDate(record.communicationDate ?? record.dateAdded)),
    ),
    el(
      'div',
      { class: 'mrow__body' },
      detail('Summary', record.summary),
      detail('NHTSA components', record.nhtsaComponents.join(', ') || null),
      detail('Manufacturer system', record.manufacturerComponentSystems.join(', ') || null),
      detail('Subsystem', record.manufacturerComponentSubsystems.join(', ') || null),
      detail('Campaign / software ID', record.manufacturerCampaignId),
      el('p', { class: 'muted' }, 'NHTSA communication ' + record.nhtsaId + (record.replacementBulletinNumber ? ' · replacement ' + record.replacementBulletinNumber : '')),
    ),
  );
}

function investigationRow(record: NhtsaInvestigation): HTMLElement {
  return el(
    'details',
    { class: 'mrow' },
    el(
      'summary',
      {},
      el('span', { class: 'mrow__title' }, record.subject || record.components[0] || 'Safety investigation'),
      el('span', { class: 'tag', 'data-tone': record.closedOn ? 'muted' : 'warn' }, record.closedOn ? 'Closed' : 'No close date'),
      el('span', { class: 'mrow__date' }, formatDate(record.openedOn)),
    ),
    el(
      'div',
      { class: 'mrow__body' },
      detail('Manufacturer', record.manufacturer),
      detail('Components', record.components.join(', ') || null),
      detail('NHTSA summary', record.summary),
      detail('Recall campaign', record.campaignNumber),
      el('p', { class: 'muted' }, 'NHTSA investigation ' + record.actionNumber + (record.closedOn ? ' · closed ' + formatDate(record.closedOn) : '')),
    ),
  );
}

function sourceStatus(label: string, status: NhtsaOdiLookup['freshness']['investigations']): HTMLElement {
  return el(
    'p',
    { class: 'odi__freshness' },
    label + ': checked ' + formatDateTime(status.checkedAt) +
      (status.sourceUpdatedAt ? ' · NHTSA file updated ' + formatDateTime(status.sourceUpdatedAt) : '') +
      ' · ' + formatNumber(status.sourceRows) + ' indexed source rows',
  );
}

export function renderNhtsaOdi(result: SectionResult<NhtsaOdiLookup>): HTMLElement {
  const wrap = el('div', { class: 'mline odi' });
  if (!result.data) {
    wrap.append(emptyNote(result.note ?? 'NHTSA ODI data could not be loaded right now.'));
  } else {
    const data = result.data;
    const itemCount = data.communicationCount + data.investigationCount;
    if (itemCount > 0) {
      wrap.append(
        el(
          'p',
          { class: 'mline__lead' },
          el('strong', {}, formatNumber(itemCount)),
          ' NHTSA records for the ',
          `${data.matchedLine.year} ${data.matchedLine.make} ${data.matchedLine.model} model line`,
        ),
      );
    }

    if (data.communicationCount > 0) {
      wrap.append(
        el('p', { class: 'mline__sub' }, formatNumber(data.communicationCount) + ' manufacturer communications (TSBs, campaigns, and other notices)'),
        el('div', { class: 'mrows' }, ...data.communications.slice(0, SHOWN_ROWS).map((record, index) => startOpen(communicationRow(record), index))),
      );
      if (data.communicationsTruncated || data.communicationCount > SHOWN_ROWS) {
        wrap.append(el('p', { class: 'mline__sub' }, 'Showing the ' + SHOWN_ROWS + ' most recent; open NHTSA’s public search for the full list.'));
      }
    }

    if (data.investigationCount > 0) {
      wrap.append(
        el('p', { class: 'mline__sub' }, formatNumber(data.investigationCount) + ' safety investigations'),
        el('div', { class: 'mrows' }, ...data.investigations.slice(0, SHOWN_ROWS).map((record, index) => startOpen(investigationRow(record), index))),
      );
      if (data.investigationsTruncated || data.investigationCount > SHOWN_ROWS) {
        wrap.append(el('p', { class: 'mline__sub' }, 'Showing the ' + SHOWN_ROWS + ' most recent; open NHTSA’s public search for the full list.'));
      }
    }

    if (data.communicationCount + data.investigationCount === 0) {
      wrap.append(emptyNote('NHTSA lists no matching communications or investigations for this model line.'));
    }
    wrap.append(
      sourceStatus('Manufacturer communications', data.freshness.manufacturerCommunications),
      sourceStatus('Investigations', data.freshness.investigations),
    );
  }

  wrap.append(
    el(
      'p',
      { class: 'mline__foot' },
      'These records match year, make, and model, not this exact VIN. A bulletin or investigation does not prove that a repair applies to or was completed on this vehicle. Summaries are an index; the full document may be available through NHTSA or the manufacturer. ',
      el('a', { href: 'https://www.nhtsa.gov/search-safety-issues', target: '_blank', rel: 'noopener noreferrer' }, 'NHTSA safety-issue search ↗'),
      ' · ',
      el('a', { href: 'https://www.nhtsa.gov/nhtsa-datasets-and-apis#manufacturer-communications', target: '_blank', rel: 'noopener noreferrer' }, 'NHTSA source files ↗'),
    ),
  );
  return wrap;
}
