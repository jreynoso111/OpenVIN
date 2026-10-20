/**
 * Pure analysis over a VIN's roadside records: the headline numbers, the
 * review flags and the merged timeline. No DOM, no network — every flag is
 * a plain statement of what the public records show, never a verdict about
 * a person. Exported for tests.
 */

import { NATIONAL_VEHICLE_OOS_RATE, type CarrierStanding } from './api/fmcsaStanding';
import type { PlateLink } from './report';
import type { CommercialInspection } from './types';

export type FlagTone = 'danger' | 'warn' | 'info';

export interface Flag {
  tone: FlagTone;
  title: string;
  detail: string;
}

export interface VinSummary {
  inspections: number;
  outOfService: number;
  vehicleViolations: number;
  carriers: number;
  plates: number;
  states: number;
  linkedVins: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Days between the newest inspection and `now`; null with no dated record. */
  daysSinceLast: number | null;
}

const DAY = 86_400_000;

function dayOf(iso: string): number {
  return new Date(iso + 'T12:00:00').getTime();
}

function distinct<T>(values: Iterable<T | null | undefined>): T[] {
  return [...new Set([...values].filter((value): value is T => value !== null && value !== undefined))];
}

/**
 * Temporary, paper and dealer plates are issued to many vehicles by design,
 * so sharing one says nothing about a plate swap.
 */
export function isGenericPlate(plate: string): boolean {
  return /^(TEMP|TMP|TEMPORARY|PAPER|DEALER|DLR|TRANSIT|TRANSPORT|EXPORT|REPO)/i.test(plate.trim());
}

/** Other VINs recorded under the (non-generic) plates this vehicle carried. */
export function linkedVins(vin: string, plateLinks: readonly PlateLink[]): string[] {
  return distinct(
    plateLinks
      .filter((link) => !isGenericPlate(link.plate))
      .flatMap((link) => link.sightings.map((sighting) => sighting.vin)),
  ).filter((other) => other !== vin);
}

/** "RICHFIELD OH" + "OH" → "RICHFIELD, OH"; a site that is only the state collapses to the state. */
export function placeLabel(site: string | null, state: string | null): string {
  const trimmed = site && state ? site.replace(new RegExp('[ ,]+' + state + '$'), '').trim() : site?.trim() ?? '';
  const name = trimmed && trimmed !== state ? trimmed : '';
  return [name, state].filter(Boolean).join(', ') || 'Place not reported';
}

export function summarize(
  vin: string,
  records: readonly CommercialInspection[],
  plateLinks: readonly PlateLink[],
  now: Date = new Date(),
): VinSummary {
  const dates = records.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
  const last = dates[dates.length - 1] ?? null;
  return {
    inspections: records.length,
    outOfService: records.filter((r) => (r.vehicleOutOfService ?? 0) > 0).length,
    vehicleViolations: records.reduce((sum, r) => sum + (r.vehicleViolations ?? 0), 0),
    carriers: distinct(records.map((r) => r.carrierDotNumber)).length,
    plates: distinct(records.map((r) => (r.plate ? r.plate + '|' + (r.plateState ?? '') : null))).length,
    states: distinct(records.map((r) => r.state)).length,
    linkedVins: linkedVins(vin, plateLinks).length,
    firstDate: dates[0] ?? null,
    lastDate: last,
    daysSinceLast: last ? Math.floor((now.getTime() - dayOf(last)) / DAY) : null,
  };
}

function plural(count: number, word: string): string {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

/** Review flags, most serious first. */
export function buildFlags(
  vin: string,
  records: readonly CommercialInspection[],
  plateLinks: readonly PlateLink[],
  now: Date = new Date(),
): Flag[] {
  const flags: Flag[] = [];
  if (records.length === 0) return flags;
  const summary = summarize(vin, records, plateLinks, now);
  const chronological = [...records].filter((r) => r.date).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  // Plates shared with other VINs.
  for (const link of plateLinks) {
    if (isGenericPlate(link.plate)) continue;
    const others = distinct(link.sightings.map((s) => s.vin)).filter((other) => other !== vin);
    if (others.length === 0) continue;
    flags.push({
      tone: others.length >= 3 ? 'danger' : 'warn',
      title: 'Plate ' + link.plate + (link.state ? ' ' + link.state : '') + ' also on ' + plural(others.length, 'other VIN'),
      detail:
        'The same plate was recorded on different vehicles. That happens when a plate is moved between trucks, and it is also how a plate swap shows up — open the plate file to compare dates.',
    });
  }

  // Vehicle out of service.
  if (summary.outOfService > 0) {
    flags.push({
      tone: 'danger',
      title: 'Placed out of service on ' + plural(summary.outOfService, 'inspection'),
      detail: 'A roadside inspector found a vehicle defect serious enough to stop the unit. See the roadside log for the findings.',
    });
  }

  // Carrier changes.
  const carriersInOrder: Array<{ dot: string; date: string }> = [];
  for (const record of chronological) {
    if (!record.carrierDotNumber || !record.date) continue;
    const previous = carriersInOrder[carriersInOrder.length - 1];
    if (!previous || previous.dot !== record.carrierDotNumber) {
      carriersInOrder.push({ dot: record.carrierDotNumber, date: record.date });
    }
  }
  if (carriersInOrder.length >= 3) {
    flags.push({
      tone: 'warn',
      title: 'Operated under ' + plural(carriersInOrder.length, 'carrier change') + ' on record',
      detail: 'Frequent changes of operating carrier are worth explaining before relying on the unit’s history.',
    });
  } else if (carriersInOrder.length === 2) {
    const [from, to] = carriersInOrder as [{ dot: string; date: string }, { dot: string; date: string }];
    const recent = (now.getTime() - dayOf(to.date)) / DAY <= 365;
    const nameOf = (dot: string): string => {
      const match = records.find((r) => r.carrierDotNumber === dot);
      return match?.carrierLegalName ?? match?.carrierDbaName ?? 'USDOT ' + dot;
    };
    flags.push({
      tone: recent ? 'warn' : 'info',
      title: 'Changed carrier once (' + nameOf(from.dot) + ' → ' + nameOf(to.dot) + ')',
      detail: recent
        ? 'The newer carrier first appears within the last year, so the unit may have been sold or re-leased recently.'
        : 'The unit moved from one carrier to another; see the Carriers section for each.',
    });
  }

  // Plate changes.
  if (summary.plates >= 3) {
    flags.push({
      tone: 'warn',
      title: 'Carried ' + plural(summary.plates, 'different plate'),
      detail: 'Three or more plates on one VIN is unusual. Confirm each plate belongs to a legitimate registration.',
    });
  }

  // Carrier standing.
  const latest = records[0];
  if (latest?.carrierDotNumber) {
    if (latest.carrierStatusCode && latest.carrierStatusCode !== 'A') {
      flags.push({
        tone: 'warn',
        title: 'Latest carrier (USDOT ' + latest.carrierDotNumber + ') is not active in the census',
        detail: 'FMCSA lists this carrier as inactive or not authorized. The unit may be parked, sold or operating under a different carrier now.',
      });
    }
    if (latest.carrierSafetyRating === 'U' || latest.carrierSafetyRating === 'C') {
      flags.push({
        tone: latest.carrierSafetyRating === 'U' ? 'danger' : 'warn',
        title: 'Latest carrier has a ' + (latest.carrierSafetyRating === 'U' ? 'Unsatisfactory' : 'Conditional') + ' safety rating',
        detail: 'This is the carrier’s compliance-review rating from FMCSA, not a statement about this truck.',
      });
    }
  }

  // Recency.
  if (summary.daysSinceLast !== null && summary.daysSinceLast > 365) {
    flags.push({
      tone: 'info',
      title: 'Not seen at roadside for over a year',
      detail: 'The newest inspection is ' + plural(Math.floor(summary.daysSinceLast / 30.44), 'month') + ' old, so the history may not reflect the current operator.',
    });
  }

  const order: Record<FlagTone, number> = { danger: 0, warn: 1, info: 2 };
  return flags.sort((a, b) => order[a.tone] - order[b.tone]);
}

/* ---------- Timeline ---------- */

export type TimelineKind = 'inspection' | 'plate' | 'carrier' | 'oos';

export interface TimelineEvent {
  date: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  /** Pivot target for the event, when it has one. */
  plate?: { plate: string; state: string | null };
  dot?: string;
}

/** Inspections plus plate and carrier changes, newest first. */
export function buildTimeline(records: readonly CommercialInspection[]): TimelineEvent[] {
  const dated = records.filter((r): r is CommercialInspection & { date: string } => Boolean(r.date));
  const chronological = [...dated].sort((a, b) => a.date.localeCompare(b.date));
  const events: TimelineEvent[] = [];
  let lastPlate: string | null = null;
  let lastDot: string | null = null;

  for (const record of chronological) {
    const where = placeLabel(record.location, record.state);
    const plateKey = record.plate ? record.plate + '|' + (record.plateState ?? '') : null;

    if (record.carrierDotNumber && record.carrierDotNumber !== lastDot) {
      events.push({
        date: record.date,
        kind: 'carrier',
        title: lastDot ? 'Carrier changed' : 'First carrier on record',
        detail: record.carrierLegalName ?? record.carrierDbaName ?? 'USDOT ' + record.carrierDotNumber,
        dot: record.carrierDotNumber,
      });
      lastDot = record.carrierDotNumber;
    }
    if (plateKey && plateKey !== lastPlate) {
      events.push({
        date: record.date,
        kind: 'plate',
        title: lastPlate ? 'Plate changed' : 'First plate on record',
        detail: null,
        plate: { plate: record.plate ?? '', state: record.plateState },
      });
      lastPlate = plateKey;
    }

    const oos = (record.vehicleOutOfService ?? 0) > 0;
    const violations = record.vehicleViolations ?? 0;
    events.push({
      date: record.date,
      kind: oos ? 'oos' : 'inspection',
      title: oos ? 'Out of service' : 'Roadside inspection',
      detail:
        where +
        (oos ? '' : violations > 0 ? ' · ' + plural(violations, 'vehicle violation') : ' · clean'),
    });
  }

  const weight: Record<TimelineKind, number> = { oos: 0, inspection: 1, plate: 2, carrier: 3 };
  return events.sort((a, b) => b.date.localeCompare(a.date) || weight[a.kind] - weight[b.kind]);
}

/* ---------- Carrier standing flags ---------- */

function percent(rate: number): string {
  return (rate * 100).toFixed(rate < 0.1 ? 1 : 0) + '%';
}

/** Flags about the latest carrier's regulatory standing. */
export function standingFlags(
  carrierName: string,
  standing: CarrierStanding,
  now: Date = new Date(),
): Flag[] {
  const flags: Flag[] = [];
  const active = standing.oosOrders.find((order) => order.active);
  if (active) {
    flags.push({
      tone: 'danger',
      title: carrierName + ' has an active FMCSA out-of-service order',
      detail:
        'FMCSA has ordered this carrier to stop operating' +
        (active.reason ? ' (' + active.reason + ')' : '') +
        (active.date ? ' since ' + active.date + '' : '') +
        '. A unit still running under it is operating against that order.',
    });
  }

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 24);
  const recent = standing.revocations.find(
    (r) => /involuntary/i.test(r.kind) && r.effectiveDate && r.effectiveDate >= cutoff.toISOString().slice(0, 10),
  );
  if (recent) {
    flags.push({
      tone: 'warn',
      title: carrierName + ' had its operating authority revoked',
      detail: 'FMCSA records an involuntary revocation effective ' + recent.effectiveDate + '. Check whether the carrier has since regained authority.',
    });
  }

  const sms = standing.sms;
  if (sms && sms.alerts.length > 0) {
    flags.push({
      tone: 'warn',
      title: carrierName + ' is over the FMCSA alert threshold',
      detail: 'Safety-measurement alerts: ' + sms.alerts.join(', ') + '. These compare the carrier’s inspections with its peers.',
    });
  }
  if (sms && sms.vehicleInspections >= 20 && sms.vehicleOosRate !== null && sms.vehicleOosRate >= NATIONAL_VEHICLE_OOS_RATE * 1.5) {
    flags.push({
      tone: 'warn',
      title: 'Carrier vehicle out-of-service rate is ' + percent(sms.vehicleOosRate),
      detail: 'That is well above the national average of about ' + percent(NATIONAL_VEHICLE_OOS_RATE) + ', across ' + sms.vehicleInspections + ' vehicle inspections.',
    });
  }
  return flags;
}
