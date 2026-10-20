import { describe, expect, it } from 'vitest';
import { buildFlags, buildTimeline, isGenericPlate, placeLabel, standingFlags, summarize } from '../src/lib/analysis';
import { parseAuthoritySince, parseOosOrders, parseRevocations, parseSms } from '../src/lib/api/fmcsaStanding';
import { stopsByDay } from '../src/ui/timeline';
import { summarizeCrashes } from '../src/lib/api/fmcsaCrashes';
import { parsePolicies } from '../src/lib/api/fmcsaInsurance';
import { stateCounts } from '../src/ui/stateMap';
import type { CommercialInspection } from '../src/lib/types';
import type { PlateLink } from '../src/lib/report';

const NOW = new Date('2026-10-20T12:00:00');

function inspection(over: Partial<CommercialInspection>): CommercialInspection {
  return {
    inspectionId: '1',
    date: '2026-08-07',
    state: 'CA',
    location: null,
    level: null,
    carrierDotNumber: '111',
    carrierLegalName: 'ACME LLC',
    carrierDbaName: null,
    carrierStatusCode: 'A',
    carrierOperationClass: null,
    carrierTruckUnits: null,
    carrierPowerUnits: null,
    carrierRecordableCrashRate: null,
    carrierMcs150Date: null,
    carrierDocketPrefix: null,
    carrierDocketNumber: null,
    carrierAuthorityStatusCode: null,
    carrierSafetyRating: null,
    carrierSafetyRatingDate: null,
    carrierBaseCity: null,
    carrierBaseState: null,
    plate: 'ABC123',
    plateState: 'CA',
    vehicleMake: null,
    vehicleTypeCode: null,
    companyUnit: null,
    companions: [],
    inspectionViolations: 0,
    inspectionOutOfService: 0,
    vehicleViolations: 0,
    vehicleOutOfService: 0,
    vehicleFindings: [],
    ...over,
  };
}

const VIN = '3HSDZAPR3MN201929';

describe('summarize', () => {
  it('counts distinct carriers, plates and states', () => {
    const records = [
      inspection({ inspectionId: '1', date: '2026-08-07' }),
      inspection({ inspectionId: '2', date: '2026-05-01', state: 'OH', carrierDotNumber: '222', plate: 'XYZ9' }),
    ];
    const s = summarize(VIN, records, [], NOW);
    expect(s).toMatchObject({ inspections: 2, carriers: 2, plates: 2, states: 2, lastDate: '2026-08-07' });
    expect(s.daysSinceLast).toBe(74);
  });
});

describe('buildFlags', () => {
  it('flags a plate shared with other VINs and ignores the VIN itself', () => {
    const links: PlateLink[] = [
      {
        plate: 'ABC123',
        state: 'CA',
        sightings: [VIN, '1FUJGLDR5CLBP8834', '1FUJGLDR5CLBP8835', '1FUJGLDR5CLBP8836'].map((vin) => ({
          inspectionId: '9', date: null, state: null, site: null, carrierDotNumber: null, vin,
          plate: 'ABC123', plateState: 'CA', make: null, unitType: null, companyUnit: null, position: 1,
          vehicleOutOfService: null,
        })),
      },
    ];
    const flags = buildFlags(VIN, [inspection({})], links, NOW);
    expect(flags[0]?.tone).toBe('danger');
    expect(flags[0]?.title).toContain('3 other VINs');
  });

  it('flags out-of-service and a recent carrier change, most serious first', () => {
    const records = [
      inspection({ inspectionId: '2', date: '2026-09-01', carrierDotNumber: '222', vehicleOutOfService: 1 }),
      inspection({ inspectionId: '1', date: '2026-01-10', carrierDotNumber: '111' }),
    ];
    const flags = buildFlags(VIN, records, [], NOW);
    expect(flags.map((f) => f.tone)).toEqual(['danger', 'warn']);
  });

  it('does not flag temporary plates shared by many vehicles', () => {
    const links: PlateLink[] = [
      {
        plate: 'TEMP',
        state: 'NE',
        sightings: ['1FUJGLDR5CLBP8834', '1FUJGLDR5CLBP8835'].map((vin) => ({
          inspectionId: '9', date: null, state: null, site: null, carrierDotNumber: null, vin,
          plate: 'TEMP', plateState: 'NE', make: null, unitType: null, companyUnit: null, position: 1,
          vehicleOutOfService: null,
        })),
      },
    ];
    expect(buildFlags(VIN, [inspection({ plate: 'TEMP', plateState: 'NE' })], links, NOW)).toEqual([]);
    expect(isGenericPlate('TEMP')).toBe(true);
    expect(isGenericPlate('ZP64015')).toBe(false);
  });

  it('collapses a site that repeats its state', () => {
    expect(placeLabel('RICHFIELD OH', 'OH')).toBe('RICHFIELD, OH');
    expect(placeLabel('CA', 'CA')).toBe('CA');
    expect(placeLabel(null, null)).toBe('Place not reported');
  });

  it('returns nothing for a clean single-carrier unit', () => {
    expect(buildFlags(VIN, [inspection({})], [], NOW)).toEqual([]);
  });

  it('notes a unit not seen for over a year', () => {
    const flags = buildFlags(VIN, [inspection({ date: '2025-01-01' })], [], NOW);
    expect(flags.some((f) => f.title.includes('over a year'))).toBe(true);
  });
});

describe('buildTimeline', () => {
  it('lists newest first with plate and carrier change events', () => {
    const records = [
      inspection({ inspectionId: '1', date: '2025-03-01' }),
      inspection({ inspectionId: '2', date: '2026-02-01', plate: 'NEW777', carrierDotNumber: '222' }),
    ];
    const events = buildTimeline(records);
    expect(events[0]?.date).toBe('2026-02-01');
    const kinds = events.filter((e) => e.date === '2026-02-01').map((e) => e.kind);
    expect(kinds).toEqual(['inspection', 'plate', 'carrier']);
    expect(events.find((e) => e.title === 'Plate changed')?.plate?.plate).toBe('NEW777');
    expect(events.find((e) => e.title === 'Carrier changed')).toBeDefined();
  });
});

describe('insurance filings', () => {
  it('keeps live filings, converts thousands to dollars, one per kind', () => {
    const rows = [
      { mod_col_1: 'BIPD/Primary', name_company: 'OLD CO', max_cov_amount: '750', effective_date: '01/01/2020', cancl_effective_date: '01/01/2025' },
      { mod_col_1: 'BIPD/Primary', name_company: 'ACE', max_cov_amount: '1000', effective_date: '08/01/2025' },
      { mod_col_1: 'BIPD/Primary', name_company: 'OLDER', max_cov_amount: '750', effective_date: '01/01/2019' },
      { mod_col_1: 'SURETY', name_company: 'TRAVELERS', max_cov_amount: '0', effective_date: '10/01/2013' },
    ];
    const policies = parsePolicies(rows, '2026-10-20');
    expect(policies.map((p) => p.kind)).toEqual(['BIPD/Primary', 'SURETY']);
    expect(policies[0]).toMatchObject({ insurer: 'ACE', limitUsd: 1_000_000, effectiveDate: '2025-08-01' });
    expect(policies[1]?.limitUsd).toBeNull();
  });
});

describe('carrier standing', () => {
  it('parses OOS orders, revocations, authority and SMS measures', () => {
    const oos = parseOosOrders([{ status: 'ACTIVE', oos_date: '2022-07-09', oos_reason: 'Unsatisfactory = Unfit' }]);
    expect(oos[0]).toMatchObject({ active: true, date: '2022-07-09' });
    const revs = parseRevocations([{ order2_type_desc: 'INVOLUNTARY REVOCATION', order2_effective_date: '05/13/2026' }]);
    expect(revs[0]).toEqual({ kind: 'INVOLUNTARY REVOCATION', effectiveDate: '2026-05-13' });
    expect(parseAuthoritySince([
      { original_action_desc: 'DENIED', orig_served_date: '01/25/1978' },
      { original_action_desc: 'GRANTED', orig_served_date: '01/09/1977' },
    ])).toBe('1977-01-09');
    const sms = parseSms([{ vehicle_insp_total: '6250', vehicle_oos_insp_total: '1243', driver_insp_total: '11641', driver_oos_insp_total: '113', veh_maint_ac: 'Y', unsafe_driv_ac: 'N' }]);
    expect(sms?.vehicleOosRate).toBeCloseTo(0.1989, 3);
    expect(sms?.alerts).toEqual(['Vehicle maintenance']);
  });

  it('turns standing into flags, most serious first', () => {
    const flags = standingFlags('ACME LLC', {
      dotNumber: '1',
      oosOrders: [{ active: true, date: '2026-01-01', reason: 'Unsatisfactory = Unfit' }],
      revocations: [{ kind: 'INVOLUNTARY REVOCATION', effectiveDate: '2026-05-13' }],
      authoritySince: null,
      sms: { inspections: 100, vehicleInspections: 50, vehicleOosInspections: 25, vehicleOosRate: 0.5, driverInspections: 50, driverOosInspections: 1, driverOosRate: 0.02, alerts: [] },
    }, NOW);
    expect(flags.map((f) => f.tone)).toEqual(['danger', 'warn', 'warn']);
  });
});

describe('timeline stops', () => {
  it('groups same-day events and orders stops oldest first', () => {
    const records = [
      inspection({ inspectionId: '1', date: '2025-03-01' }),
      inspection({ inspectionId: '2', date: '2026-02-01', plate: 'NEW777', carrierDotNumber: '222' }),
    ];
    const stops = stopsByDay(buildTimeline(records));
    expect(stops.map((s) => s.date)).toEqual(['2025-03-01', '2026-02-01']);
    expect(stops[1]?.events.map((e) => e.kind)).toEqual(['carrier', 'plate', 'inspection']);
  });
});

describe('crash summary and state counts', () => {
  it('sums fatalities, injuries and tow-aways', () => {
    const rows = [
      { fatalities: '0', injuries: '2', tow_away: 'Y' },
      { fatalities: '1', injuries: '0', tow_away: 'N' },
    ];
    expect(summarizeCrashes('53467', rows, '2024-10-20')).toMatchObject({
      crashes: 2, fatalities: 1, injuries: 2, towAways: 1, capped: false,
    });
  });

  it('counts states and keeps the latest date', () => {
    const counts = stateCounts([
      { state: 'CA', date: '2026-01-01' },
      { state: 'CA', date: '2026-03-01' },
      { state: 'ON', date: null },
    ]);
    expect(counts.find((c) => c.state === 'CA')).toMatchObject({ count: 2, lastDate: '2026-03-01' });
    expect(counts).toHaveLength(2);
  });
});
