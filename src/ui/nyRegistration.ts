/**
 * NY registration record, limited to facts about the vehicle (class, body,
 * color, weights, validity). No registrant, no location, no person-level flags.
 */

import type { NyRegistration } from '../lib/types';
import { el, formatDate, formatNumber } from './dom';
import { factList } from './panel';

const COLORS: Readonly<Record<string, string>> = {
  BK: 'Black', BL: 'Blue', BR: 'Brown', GN: 'Green', GY: 'Gray', OR: 'Orange',
  RD: 'Red', TN: 'Tan', WH: 'White', YW: 'Yellow',
};

const CLASSES: Readonly<Record<string, string>> = { PAS: 'Passenger', COM: 'Commercial' };

const BODIES: Readonly<Record<string, string>> = {
  '4DSD': '4-door sedan', '2DSD': '2-door sedan', SUBN: 'Suburban / SUV', PICK: 'Pickup',
  VAN: 'Van', DELV: 'Delivery', FLAT: 'Flatbed', TRAC: 'Tractor', TRLR: 'Trailer', TANK: 'Tank',
};

/** "GY" → "Gray (GY)"; unknown codes stay as published. */
function decoded(code: string | null, names: Readonly<Record<string, string>>): string | null {
  if (!code) return null;
  const name = names[code.toUpperCase()];
  return name ? name + ' (' + code + ')' : code;
}

function sentence(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function weight(value: number | null): string | null {
  return value === null || value <= 0 ? null : formatNumber(value) + ' lb';
}

function validity(registration: NyRegistration, today: Date): HTMLElement | null {
  if (!registration.expires) return null;
  const expired = new Date(registration.expires + 'T23:59:59').getTime() < today.getTime();
  return el(
    'span',
    {},
    el('span', { class: 'tag', 'data-tone': expired ? 'warn' : 'ok' }, expired ? 'Expired' : 'Current'),
    ' ' + (expired ? 'expired ' : 'through ') + formatDate(registration.expires),
  );
}

/** The most recent registration record for the VIN, as a fact list with a short caveat. */
export function renderNyRegistration(registrations: readonly NyRegistration[], today: Date = new Date()): HTMLElement | null {
  const latest = registrations[0];
  if (!latest) return null;
  const facts = factList([
    ['Registration', validity(latest, today)],
    ['Registered since', latest.validFrom ? formatDate(latest.validFrom) : null],
    ['Registration class', decoded(latest.registrationClass, CLASSES)],
    ['Body type', decoded(latest.bodyType, BODIES)],
    ['Color', decoded(latest.color, COLORS)],
    ['Fuel', latest.fuel ? sentence(latest.fuel) : null],
    ['Empty weight', weight(latest.unladenWeight)],
    ['Max gross weight', weight(latest.maxGrossWeight)],
    ['Passengers', latest.passengers && latest.passengers > 0 ? String(latest.passengers) : null],
  ]);
  return el(
    'div',
    { class: 'ny-registration' },
    el('h3', { class: 'freq__title' }, 'New York registration record'),
    facts,
    el(
      'p',
      { class: 'note' },
      'Facts about the vehicle only. Registrant and location details are not requested or shown; registrations expired for more than two years are not published.',
    ),
  );
}
