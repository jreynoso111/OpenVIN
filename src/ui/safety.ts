/** Section 5 — NCAP safety ratings: stars, rollover, counts, photo. */

import type { SafetyRating, SectionResult } from '../lib/types';
import { el, formatNumber } from './dom';

const MAX_STARS = 5;

function stars(rating: string | null): HTMLElement {
  const parsed = rating === null ? NaN : Number.parseInt(rating, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_STARS) {
    return el('span', { class: 'stars__na' }, rating ?? 'Not rated');
  }
  const wrap = el('span', {
    class: 'stars',
    role: 'img',
    'aria-label': `${parsed} out of ${MAX_STARS} stars`,
  });
  for (let i = 0; i < MAX_STARS; i += 1) {
    wrap.append(
      el(
        'span',
        { class: i < parsed ? 'on' : 'off', 'aria-hidden': 'true' },
        i < parsed ? '★' : '☆',
      ),
    );
  }
  return wrap;
}

function ratingRow(
  label: string,
  rating: string | null,
  isOverall = false,
): HTMLElement {
  return el(
    'div',
    { class: `rating-row${isOverall ? ' rating-row--overall' : ''}` },
    el('span', { class: 'rating-row__label' }, label),
    stars(rating),
  );
}

function countItem(label: string, value: number | null): HTMLElement | null {
  if (value === null) return null;
  return el('span', {}, el('strong', {}, formatNumber(value)), ` ${label}`);
}

export function renderSafety(result: SectionResult<SafetyRating>): HTMLElement {
  if (result.status !== 'hit' || !result.data) {
    return el(
      'p',
      { class: 'note' },
      result.note ??
        'NHTSA has not published NCAP crash-test ratings for this vehicle.',
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
  const items = [
    countItem('complaints', safety.complaintsCount),
    countItem('recalls', safety.recallsCount),
    countItem('investigations', safety.investigationCount),
  ];
  for (const item of items) {
    if (item) counts.append(item);
  }
  if (counts.childElementCount > 0) ratings.append(counts);

  const hasPhoto = Boolean(safety.vehiclePicture);
  const grid = el(
    'div',
    { class: `safety-grid${hasPhoto ? ' safety-grid--with-photo' : ''}` },
    ratings,
  );

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
  );
}
