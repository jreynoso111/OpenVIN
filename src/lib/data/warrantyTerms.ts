/**
 * Factory (new-vehicle) warranty terms for major US-market brands.
 * These are the widely published standard terms; they change across model
 * years and trims, so everything derived from this table is an ESTIMATE.
 * Months are from in-service date; miles are odometer limits.
 *
 * UNLIMITED_MILES marks coverages with no mileage cap (e.g. corrosion) —
 * render as "unlimited", never as a number.
 */

export const UNLIMITED_MILES = Number.POSITIVE_INFINITY;

export interface WarrantyTerm {
  coverage: string;
  termMonths: number;
  termMiles: number;
  note?: string;
}

const ORIGINAL_OWNER_NOTE =
  'Long powertrain term applies to the original owner; subsequent owners typically get 60 months / 60,000 miles.';

const basic = (termMonths: number, termMiles: number): WarrantyTerm => ({
  coverage: 'Basic (bumper-to-bumper)',
  termMonths,
  termMiles,
});
const powertrain = (termMonths: number, termMiles: number, note?: string): WarrantyTerm => ({
  coverage: 'Powertrain',
  termMonths,
  termMiles,
  ...(note ? { note } : {}),
});
const corrosion = (termMonths: number, termMiles: number): WarrantyTerm => ({
  coverage: 'Corrosion (rust-through)',
  termMonths,
  termMiles,
  ...(termMiles === UNLIMITED_MILES ? { note: 'No mileage limit.' } : {}),
});
const roadside = (termMonths: number, termMiles: number): WarrantyTerm => ({
  coverage: 'Roadside assistance',
  termMonths,
  termMiles,
  ...(termMiles === UNLIMITED_MILES ? { note: 'No mileage limit.' } : {}),
});

const TOYOTA: readonly WarrantyTerm[] = [
  basic(36, 36_000),
  powertrain(60, 60_000),
  corrosion(60, UNLIMITED_MILES),
  roadside(24, 25_000),
];
const HONDA: readonly WarrantyTerm[] = [
  basic(36, 36_000),
  powertrain(60, 60_000),
  corrosion(60, UNLIMITED_MILES),
];
const FORD: readonly WarrantyTerm[] = [
  basic(36, 36_000),
  powertrain(60, 60_000),
  corrosion(60, UNLIMITED_MILES),
  roadside(60, 60_000),
];
const GM_MAINSTREAM: readonly WarrantyTerm[] = [
  basic(36, 36_000),
  powertrain(60, 60_000),
  corrosion(72, 100_000),
  roadside(60, 60_000),
];
const GM_PREMIUM: readonly WarrantyTerm[] = [
  basic(48, 50_000),
  powertrain(72, 70_000),
  corrosion(72, 100_000),
  roadside(72, 70_000),
];
const HYUNDAI_KIA_GENESIS: readonly WarrantyTerm[] = [
  basic(60, 60_000),
  powertrain(120, 100_000, ORIGINAL_OWNER_NOTE),
  corrosion(84, UNLIMITED_MILES),
  roadside(60, UNLIMITED_MILES),
];
const STELLANTIS: readonly WarrantyTerm[] = [
  basic(36, 36_000),
  powertrain(60, 60_000),
  corrosion(60, 100_000),
  roadside(60, 60_000),
];
const GERMAN_48_50: readonly WarrantyTerm[] = [
  basic(48, 50_000),
  powertrain(48, 50_000),
];

/** Brand key (lowercase vPIC make) → standard factory warranty rows. */
export const WARRANTY_TERMS: Readonly<Record<string, readonly WarrantyTerm[]>> = {
  toyota: TOYOTA,
  lexus: [basic(48, 50_000), powertrain(72, 70_000), corrosion(72, UNLIMITED_MILES), roadside(48, UNLIMITED_MILES)],
  honda: HONDA,
  acura: [basic(48, 50_000), powertrain(72, 70_000), corrosion(60, UNLIMITED_MILES)],
  ford: FORD,
  lincoln: [basic(48, 50_000), powertrain(72, 70_000), corrosion(60, UNLIMITED_MILES)],
  chevrolet: GM_MAINSTREAM,
  gmc: GM_MAINSTREAM,
  buick: GM_PREMIUM,
  cadillac: GM_PREMIUM,
  nissan: [basic(36, 36_000), powertrain(60, 60_000), corrosion(60, UNLIMITED_MILES)],
  infiniti: [basic(48, 60_000), powertrain(72, 70_000), corrosion(84, UNLIMITED_MILES)],
  hyundai: HYUNDAI_KIA_GENESIS,
  kia: [basic(60, 60_000), powertrain(120, 100_000, ORIGINAL_OWNER_NOTE), corrosion(60, 100_000), roadside(60, 60_000)],
  genesis: HYUNDAI_KIA_GENESIS,
  subaru: [basic(36, 36_000), powertrain(60, 60_000), corrosion(60, UNLIMITED_MILES)],
  mazda: [basic(36, 36_000), powertrain(60, 60_000), corrosion(60, UNLIMITED_MILES)],
  volkswagen: [...GERMAN_48_50, corrosion(84, 100_000), roadside(36, 36_000)],
  audi: [...GERMAN_48_50, corrosion(144, UNLIMITED_MILES)],
  bmw: [...GERMAN_48_50, corrosion(144, UNLIMITED_MILES), roadside(48, UNLIMITED_MILES)],
  mini: [...GERMAN_48_50, corrosion(144, UNLIMITED_MILES)],
  'mercedes-benz': [...GERMAN_48_50, corrosion(48, 50_000)],
  volvo: [...GERMAN_48_50, corrosion(144, UNLIMITED_MILES), roadside(48, UNLIMITED_MILES)],
  tesla: [
    basic(48, 50_000),
    {
      coverage: 'Battery & drive unit',
      termMonths: 96,
      termMiles: 100_000,
      note: 'Mileage cap ranges 100,000–150,000 miles depending on model/configuration; 100,000 shown as the conservative floor.',
    },
  ],
  jeep: STELLANTIS,
  ram: STELLANTIS,
  dodge: STELLANTIS,
  chrysler: STELLANTIS,
};
