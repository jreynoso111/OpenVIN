/**
 * Guided link-outs (Tier 3, docs/LEGAL.md): plain URLs the user opens
 * themselves. Nothing here is ever fetched by our code.
 */

import type { GuidedLink, VehicleIdentity } from './types';

/** Official OEM recall-lookup pages, keyed by lowercase vPIC make. */
const OEM_RECALL_URLS: Readonly<Record<string, string>> = {
  ford: 'https://www.ford.com/support/recalls/',
  lincoln: 'https://www.lincoln.com/support/recalls/',
  toyota: 'https://www.toyota.com/recall',
  lexus: 'https://www.lexus.com/recall',
  honda: 'https://owners.honda.com/recalls',
  acura: 'https://owners.acura.com/recalls',
  chevrolet: 'https://my.gm.com/recalls',
  gmc: 'https://my.gm.com/recalls',
  buick: 'https://my.gm.com/recalls',
  cadillac: 'https://my.gm.com/recalls',
  nissan: 'https://www.nissanusa.com/recalls-vin.html',
  infiniti: 'https://www.infinitiusa.com/recalls-vin.html',
  hyundai: 'https://owners.hyundaiusa.com/content/hyundai/us/en/recall.html',
  kia: 'https://owners.kia.com/us/en/recalls.html',
  genesis: 'https://www.genesis.com/us/en/service/recall.html',
  subaru: 'https://www.subaru.com/recalls',
  volkswagen: 'https://www.vw.com/en/owners-and-services/about-my-vehicle/recalls.html',
  audi: 'https://web.audiusa.com/recall/',
  bmw: 'https://my.bmwusa.com/safety-and-emission-recalls',
  'mercedes-benz': 'https://www.mbusa.com/en/recall',
  mazda: 'https://www.mazdarecallinfo.com',
  volvo: 'https://www.volvocars.com/us/l/recall/',
  tesla: 'https://www.tesla.com/vin-recall-search',
  jeep: 'https://www.mopar.com/en-us/my-vehicle/recalls/search.html',
  ram: 'https://www.mopar.com/en-us/my-vehicle/recalls/search.html',
  dodge: 'https://www.mopar.com/en-us/my-vehicle/recalls/search.html',
  chrysler: 'https://www.mopar.com/en-us/my-vehicle/recalls/search.html',
};

const NHTSA_RECALL_FALLBACK = 'https://www.nhtsa.gov/recalls';

const GM_MAKES = new Set(['chevrolet', 'gmc', 'buick', 'cadillac']);
const STELLANTIS_MAKES = new Set(['chrysler', 'dodge', 'jeep', 'ram']);

/** Per-make owner portals where dealers/owners can pull service history. */
const SERVICE_PORTALS: Readonly<Record<string, { label: string; url: string }>> = {
  toyota: { label: 'Toyota Owners portal', url: 'https://www.toyota.com/owners/' },
  honda: { label: 'Honda Owners portal', url: 'https://owners.honda.com/' },
  hyundai: { label: 'MyHyundai owner portal', url: 'https://owners.hyundaiusa.com/' },
  kia: { label: 'Kia Owners portal', url: 'https://owners.kia.com/us/en/kia-owner-portal.html' },
};

function makeKey(identity: VehicleIdentity | null): string {
  return (identity?.make ?? '').trim().toLowerCase();
}

function oemRecallLink(make: string): GuidedLink {
  const url = OEM_RECALL_URLS[make];
  return {
    kind: 'oem-recall',
    label: url ? 'Manufacturer recall lookup' : 'NHTSA recall lookup',
    url: url ?? NHTSA_RECALL_FALLBACK,
    description:
      'Enter the VIN to see open recalls for this exact vehicle and whether repairs were completed.',
    badge: 'Free',
  };
}

function stickerLinks(make: string, vin: string): GuidedLink[] {
  const encodedVin = encodeURIComponent(vin);
  if (GM_MAKES.has(make)) {
    return [
      {
        kind: 'sticker',
        label: 'Original window sticker (GM)',
        url: `https://cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin=${encodedVin}`,
        description:
          'Opens the factory window sticker PDF with original options and MSRP — generally covers ~2016 and newer vehicles and may return an error for older ones.',
        badge: 'Free',
      },
    ];
  }
  if (STELLANTIS_MAKES.has(make)) {
    return [
      {
        kind: 'sticker',
        label: 'Original window sticker (Stellantis)',
        url: `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${encodedVin}`,
        description:
          'Opens the factory window sticker PDF (works across Chrysler, Dodge, Jeep, and Ram) — generally covers ~2016 and newer vehicles and may return an error for older ones.',
        badge: 'Free',
      },
    ];
  }
  return [];
}

function serviceLinks(make: string): GuidedLink[] {
  const portal = SERVICE_PORTALS[make];
  if (!portal) return [];
  return [
    {
      kind: 'service',
      label: portal.label,
      url: portal.url,
      description:
        'Dealers can print the full service history from the VIN for free — the owner portal also shows dealer-performed maintenance.',
      badge: 'Free',
    },
  ];
}

const STATE_TITLE_LINKS: readonly GuidedLink[] = [
  {
    kind: 'state-title',
    label: 'Florida title & brand check (MVCheck)',
    url: 'https://services.flhsmv.gov/MVCheckWeb/',
    description: 'Enter the VIN to see Florida title status, brands, and last odometer reading on record.',
    badge: 'Free',
  },
  {
    kind: 'state-title',
    label: 'Ohio BMV title search',
    url: 'https://bmvonline.dps.ohio.gov/bmvonline/titles/titlesearch',
    description: 'Search Ohio title records by VIN for title status, brands, and odometer at last transfer.',
    badge: 'Free',
  },
  {
    kind: 'state-title',
    label: 'New York DMV title status',
    url: 'https://process.dmv.ny.gov/titlestatus/',
    description: 'Check whether NY has a title on file for this VIN and its issue status.',
    badge: 'Free',
  },
  {
    kind: 'state-title',
    label: 'Massachusetts title status',
    url: 'https://www.mass.gov/how-to/check-the-status-of-your-vehicles-title',
    description: 'Follow the RMV steps to check Massachusetts title status for this VIN.',
    badge: 'Free',
  },
];

const STATE_EMISSIONS_LINKS: readonly GuidedLink[] = [
  {
    kind: 'state-emissions',
    label: 'California smog check history',
    url: 'https://www.bar.ca.gov/inspection',
    description: 'Look up California smog inspection history by VIN — each test records the odometer.',
    badge: 'Free',
  },
  {
    kind: 'state-emissions',
    label: 'Texas inspection history (MyTxCar)',
    url: 'https://www.mytxcar.org',
    description: 'Look up Texas vehicle inspection records by VIN, including odometer readings.',
    badge: 'Free',
  },
  {
    kind: 'state-emissions',
    label: 'Maryland emissions (VEIP)',
    url: 'https://mva.mdveip.com/',
    description: 'Look up Maryland emissions test history by VIN, including odometer readings.',
    badge: 'Free',
  },
  {
    kind: 'state-emissions',
    label: 'Wisconsin inspection results',
    url: 'https://www.wisconsinvip2.org/Motorists/VehicleInspectionResults',
    description: 'Look up Wisconsin vehicle inspection results by VIN, including odometer readings.',
    badge: 'Free',
  },
];

const AUCTION_LINKS: readonly GuidedLink[] = [
  {
    kind: 'auction',
    label: 'Poctra salvage-auction archive',
    url: 'https://poctra.com',
    description: 'Search this VIN for salvage-auction records and photos (paste the VIN into the search box).',
    badge: 'Free',
  },
  {
    kind: 'auction',
    label: 'Stat.vin auction history',
    url: 'https://stat.vin',
    description: 'Search this VIN for salvage-auction records and photos from Copart and IAAI (paste the VIN into the search box).',
    badge: 'Free',
  },
];

/** Build the full guided link-out list for a VIN (identity may be null). */
export function buildGuidedLinks(vin: string, identity: VehicleIdentity | null): GuidedLink[] {
  const make = makeKey(identity);
  return [
    {
      kind: 'nmvtis',
      label: 'Free NMVTIS report (Carsforsale.com)',
      url: 'https://www.carsforsale.com/free-vehicle-history-reports',
      description:
        'Enter the VIN for the full federal NMVTIS title, brand, and total-loss report — the same government database behind paid reports.',
      badge: 'Free',
    },
    {
      kind: 'nicb',
      label: 'NICB VINCheck (theft & total loss)',
      url: 'https://www.nicb.org/vincheck',
      description: 'Enter the VIN to check insurance theft and total-loss records.',
      badge: 'Free · 5/day',
    },
    oemRecallLink(make),
    ...stickerLinks(make, vin),
    ...STATE_TITLE_LINKS,
    ...STATE_EMISSIONS_LINKS,
    ...AUCTION_LINKS,
    ...serviceLinks(make),
  ];
}
