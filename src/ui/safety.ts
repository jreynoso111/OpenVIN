/** Section 5 — NCAP safety ratings: segment bars, counts, photo. */

import type { SafetyRating, SectionResult } from '../lib/types';
import { el, formatNumber } from './dom';
import { ratingSegments } from './viz';

function ratingRow(
  label: string,
  rating: string | null,
  isOverall = false,
): HTMLElement {
  return el(
    'div',
    { class: `rating-row${isOverall ? ' rating-row--overall' : ''}` },
    el('span', { class: 'rating-row__label' }, label),
    ratingSegments(rating),
  );
}

function countItem(label: string, value: number | null): HTMLElement | null {
  if (value === null) return null;
  return el('span', {}, el('strong', {}, formatNumber(value)), ` ${label}`);
}

function officialIssueLinks(): HTMLElement {
  return el(
    'p',
    { class: 'mline__foot' },
    'Public follow-up: ',
    el(
      'a',
      {
        href: 'https://www.nhtsa.gov/search-safety-issues',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      'search recalls and investigations ↗',
    ),
    ' · ',
    el(
      'a',
      {
        href: 'https://www.nhtsa.gov/nhtsa-datasets-and-apis#manufacturer-communications',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      'manufacturer communications and service bulletins ↗',
    ),
  );
}

export function renderSafety(result: SectionResult<SafetyRating>): HTMLElement {
  if (result.status !== 'hit' || !result.data) {
    return el(
      'div',
      {},
      el(
        'p',
        { class: 'note' },
        result.note ?? 'NHTSA has not published NCAP crash-test ratings for this vehicle.',
      ),
      officialIssueLinks(),
    );
  }

  const safety = result.data;
  const ratings = el(
    'div',
    { class: 'card' },
    el(
      'div',
      { class: 'rating-rows' },
      ratingRow('Overall', safety.overallRating, true),
      ratingRow('Frontal crash', safety.frontCrashRating),
      ratingRow('Side crash', safety.sideCrashRating),
      ratingRow('Rollover', safety.rolloverRating),
    ),
  );

  const counts = el('div', { class: 'safety-counts' });
  const items = [countItem('model-line investigations', safety.investigationCount)];
  for (const item of items) {
    if (item) counts.append(item);
  }
  if (counts.childElementCount > 0) ratings.append(counts);

  const grid = el('div', { class: 'safety-grid' }, ratings);

  if (safety.vehiclePicture) {
    grid.append(
      el(
        'figure',
        {},
        el('img', {
          class: 'safety-photo',
          src: safety.vehiclePicture,
          alt: `NHTSA photo: ${safety.vehicleDescription}`,
          width: 480,
          height: 320,
          loading: 'lazy',
          decoding: 'async',
        }),
      ),
    );
  }

  return el(
    'div',
    {},
    el(
      'p',
      { class: 'note', style: 'margin-bottom:1rem' },
      `Rated as: ${safety.vehicleDescription}`,
    ),
    grid,
    el(
      'p',
      { class: 'mline__foot' },
      'The rating and investigation count describe the closest NHTSA test variant for this model line, not this exact VIN. A manufacturer bulletin does not prove that a repair applies to or was completed on this vehicle.',
    ),
    officialIssueLinks(),
  );
}
