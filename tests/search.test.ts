import { describe, expect, test } from 'vitest';
import { nameTokens, normalizePlate, summarizeFleet } from '../src/lib/api/fmcsaLookup';
import { parseCarrier, parseInspection, parseUnit } from '../src/lib/api/fmcsaShared';
import { toSighting } from '../src/lib/api/fmcsa';
import { distinctPlates } from '../src/lib/report';
import { parseSearch, queryFromParams, queryHref } from '../src/lib/query';
import type { CommercialInspection } from '../src/lib/types';

describe('parseSearch (auto mode)', () => {
  const kind = (raw: string): string => {
    const result = parseSearch(raw, 'auto');
    return result.ok ? result.query.kind + ':' + result.query.value + (result.query.state ? '/' + result.query.state : '') : 'error';
  };

  test('recognizes each identifier', () => {
    expect(kind('3akjhhdr7ksjx1198')).toBe('vin:3AKJHHDR7KSJX1198');
    expect(kind('80764A NV')).toBe('plate:80764A/NV');
    expect(kind('NV 80764A')).toBe('plate:80764A/NV');
    expect(kind('USDOT 53467')).toBe('dot:53467');
    expect(kind('DOT#53467')).toBe('dot:53467');
    expect(kind('53467')).toBe('dot:53467');
    expect(kind('MC-196884')).toBe('mc:196884');
    expect(kind('Werner Enterprises')).toBe('name:Werner Enterprises');
  });

  test('rejects a 17-character string with a bad check digit', () => {
    expect(parseSearch('1FTFW1ET5DFC10312', 'auto').ok).toBe(false);
  });

  test('explicit plate mode accepts digit-only plates and a chosen state', () => {
    const result = parseSearch('24-13648', 'plate', 'IN');
    expect(result.ok && result.query).toEqual({ kind: 'plate', value: '2413648', state: 'IN' });
  });

  test('explicit company mode treats words as a name', () => {
    const result = parseSearch('ABC 123 TRUCKING', 'carrier');
    expect(result.ok && result.query.kind).toBe('name');
  });

  test('empty input explains what to type', () => {
    const result = parseSearch('   ', 'auto');
    expect(result.ok).toBe(false);
  });
});

describe('query URLs', () => {
  test('round-trip through URL params', () => {
    for (const query of [
      { kind: 'vin', value: '3AKJHHDR7KSJX1198', state: null },
      { kind: 'plate', value: '80764A', state: 'NV' },
      { kind: 'dot', value: '53467', state: null },
      { kind: 'name', value: 'Werner Enterprises', state: null },
    ] as const) {
      const params = new URLSearchParams(queryHref(query).slice(1));
      expect(queryFromParams(params)).toEqual(query);
    }
  });

  test('ignores unknown plate states', () => {
    expect(queryFromParams(new URLSearchParams('plate=abc1&state=ZZ'))).toEqual({ kind: 'plate', value: 'ABC1', state: null });
  });
});

describe('carrier census parsing', () => {
  test('keeps business names and base city', () => {
    const carrier = parseCarrier({
      dot_number: '295043',
      legal_name: 'HAROLD DAVIS TRUCKING INC',
      business_org_id: '3',
      phy_city: 'WISCONSIN RAPIDS',
      phy_state: 'WI',
      phy_street: '2121 JEFFERSON ST',
      status_code: 'I',
    });
    expect(carrier?.legalName).toBe('HAROLD DAVIS TRUCKING INC');
    expect(carrier?.baseCity).toBe('WISCONSIN RAPIDS');
    expect(carrier && 'street' in carrier).toBe(false);
  });

  test('withholds the name and place of individual operators', () => {
    const carrier = parseCarrier({
      dot_number: '195666',
      legal_name: 'JANE SAMPLE',
      dba_name: 'JS HAULING',
      business_org_id: '1',
      phy_city: 'KNOXVILLE',
      phy_state: 'IA',
    });
    expect(carrier?.legalName).toBeNull();
    expect(carrier?.dbaName).toBeNull();
    expect(carrier?.isBusiness).toBe(false);
    expect(carrier?.baseCity).toBeNull();
  });
});

describe('name and plate normalization', () => {
  test('tokens are SoQL-safe', () => {
    expect(nameTokens("O'Neil & Sons, LLC")).toEqual(['NEIL', '&', 'SONS', 'LLC'].filter((t) => t.length >= 2));
    expect(nameTokens("x' OR 1=1 --")).toEqual(['OR']);
  });

  test('plates drop spaces and dashes', () => {
    expect(normalizePlate(' ab-12 3 ')).toBe('AB123');
  });
});

describe('fleet summary', () => {
  const inspections = [
    parseInspection({ inspection_id: '1', dot_number: '00053467', insp_date: '20260901', report_state: 'CA', location_desc: 'CAJON SCALES' }),
    parseInspection({ inspection_id: '2', dot_number: '53467', insp_date: '20260101', report_state: 'NV' }),
    parseInspection({ inspection_id: '3', dot_number: '53467', insp_date: '20250601', report_state: 'CA' }),
  ].filter((row) => row !== null);

  const unit = (id: string, vin: string, plate: string, companyUnit: string) =>
    parseUnit({
      inspection_id: id,
      insp_unit_vehicle_id_number: vin,
      insp_unit_license: plate,
      insp_unit_license_state: 'NV',
      insp_unit_company: companyUnit,
      insp_unit_type_id: '11',
      insp_unit_number: '1',
    });

  test('groups by VIN, collects plates and unit numbers, newest first', () => {
    const byId = new Map(inspections.map((row) => [row.inspectionId, row]));
    const sightings = [
      unit('3', 'VINAAAAAAAAAAAAA1', 'P1', '886'),
      unit('1', 'VINAAAAAAAAAAAAA1', 'P2', '886/RED'),
      unit('2', 'VINBBBBBBBBBBBBB2', 'P3', '902'),
    ]
      .filter((u) => u !== null)
      .map((u) => toSighting(u, byId.get(u.inspectionId)));
    const fleet = summarizeFleet(sightings, inspections, false);
    expect(fleet.vehicles.map((v) => v.vin)).toEqual(['VINAAAAAAAAAAAAA1', 'VINBBBBBBBBBBBBB2']);
    expect(fleet.vehicles[0]?.plates).toEqual(['P2 NV', 'P1 NV']);
    expect(fleet.vehicles[0]?.companyUnits).toEqual(['886/RED', '886']);
    expect(fleet.vehicles[0]?.lastSeen.site).toBe('CAJON SCALES');
    expect(fleet.vehicles[0]?.lastSeen.carrierDotNumber).toBe('53467');
    expect(fleet.vehicles[0]?.lastSeen.unitType).toBe('Truck tractor');
    expect(fleet.states).toEqual([
      { state: 'CA', count: 2, lastDate: '2026-09-01' },
      { state: 'NV', count: 1, lastDate: '2026-01-01' },
    ]);
    expect(fleet.oldestDate).toBe('2025-06-01');
  });
});

describe('distinctPlates', () => {
  test('dedupes plate/state pairs in record order', () => {
    const records = [
      { plate: '80764A', plateState: 'NV' },
      { plate: '80764A', plateState: 'NV' },
      { plate: null, plateState: null },
      { plate: '80764A', plateState: 'AZ' },
    ] as unknown as CommercialInspection[];
    expect(distinctPlates(records)).toEqual([
      { plate: '80764A', state: 'NV' },
      { plate: '80764A', state: 'AZ' },
    ]);
  });
});
