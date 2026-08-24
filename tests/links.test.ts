import { describe, expect, test } from 'vitest';
import type { VehicleIdentity } from '../src/lib/types';
import { buildGuidedLinks } from '../src/lib/links';

const VIN = '1HGCM82633A004352';

function identityFor(make: string): VehicleIdentity {
  return {
    vin: VIN,
    modelYear: 2020,
    make,
    model: 'Test',
    trim: null,
    series: null,
    bodyClass: null,
    vehicleType: null,
    engine: {
      cylinders: null,
      displacementL: null,
      horsepower: null,
      fuelType: null,
      configuration: null,
    },
    driveType: null,
    transmission: null,
    plant: { city: null, state: null, country: null },
    gvwr: null,
    decodeWarning: null,
  };
}

describe('buildGuidedLinks', () => {
  test('always includes NMVTIS and NICB with badges, in that order', () => {
    const links = buildGuidedLinks(VIN, null);
    expect(links[0]).toMatchObject({
      kind: 'nmvtis',
      url: 'https://www.carsforsale.com/free-vehicle-history-reports',
      badge: 'Free',
    });
    expect(links[1]).toMatchObject({
      kind: 'nicb',
      url: 'https://www.nicb.org/vincheck',
      badge: 'Free · 5/day',
    });
  });

  test('maps OEM recall pages per make (case-insensitive)', () => {
    const cases: [string, string][] = [
      ['TOYOTA', 'https://www.toyota.com/recall'],
      ['Honda', 'https://owners.honda.com/recalls'],
      ['CHEVROLET', 'https://my.gm.com/recalls'],
      ['MERCEDES-BENZ', 'https://www.mbusa.com/en/recall'],
      ['TESLA', 'https://www.tesla.com/vin-recall-search'],
      ['RAM', 'https://www.mopar.com/en-us/my-vehicle/recalls/search.html'],
    ];
    for (const [make, url] of cases) {
      const oem = buildGuidedLinks(VIN, identityFor(make)).find((l) => l.kind === 'oem-recall');
      expect(oem?.url).toBe(url);
    }
  });

  test('falls back to NHTSA recalls for unknown makes and null identity', () => {
    const unknown = buildGuidedLinks(VIN, identityFor('KOENIGSEGG')).find(
      (l) => l.kind === 'oem-recall',
    );
    expect(unknown?.url).toBe('https://www.nhtsa.gov/recalls');
    const noIdentity = buildGuidedLinks(VIN, null).find((l) => l.kind === 'oem-recall');
    expect(noIdentity?.url).toBe('https://www.nhtsa.gov/recalls');
  });

  test('GM makes get a window-sticker link with the VIN in the URL', () => {
    const sticker = buildGuidedLinks(VIN, identityFor('GMC')).find((l) => l.kind === 'sticker');
    expect(sticker?.url).toBe(
      `https://cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin=${VIN}`,
    );
    expect(sticker?.description).toMatch(/2016/);
  });

  test('Stellantis makes get the Chrysler window-sticker link', () => {
    const sticker = buildGuidedLinks(VIN, identityFor('JEEP')).find((l) => l.kind === 'sticker');
    expect(sticker?.url).toBe(
      `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${VIN}`,
    );
  });

  test('non-GM/Stellantis makes get no sticker link', () => {
    const links = buildGuidedLinks(VIN, identityFor('TOYOTA'));
    expect(links.some((l) => l.kind === 'sticker')).toBe(false);
  });

  test('service portal links only exist for supported makes', () => {
    const toyota = buildGuidedLinks(VIN, identityFor('TOYOTA')).find((l) => l.kind === 'service');
    expect(toyota?.url).toBe('https://www.toyota.com/owners/');
    expect(toyota?.description).toMatch(/dealers can print/i);
    const bmw = buildGuidedLinks(VIN, identityFor('BMW'));
    expect(bmw.some((l) => l.kind === 'service')).toBe(false);
  });

  test('includes 4 state-title, 4 state-emissions, and 2 auction links', () => {
    const links = buildGuidedLinks(VIN, null);
    expect(links.filter((l) => l.kind === 'state-title')).toHaveLength(4);
    expect(links.filter((l) => l.kind === 'state-emissions')).toHaveLength(4);
    const auctions = links.filter((l) => l.kind === 'auction');
    expect(auctions.map((l) => l.url)).toEqual(['https://poctra.com', 'https://stat.vin']);
  });

  test('every link has a label, https URL, and a description', () => {
    for (const link of buildGuidedLinks(VIN, identityFor('CHRYSLER'))) {
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.url).toMatch(/^https:\/\//);
      expect(link.description.length).toBeGreaterThan(10);
    }
  });
});
