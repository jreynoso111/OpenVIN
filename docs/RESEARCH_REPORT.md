# HighView — Full Research Report: Building a Free Carfax-Equivalent

> Consolidated from five parallel deep-research passes + one supply-chain verification
> pass (2026-08-23). Endpoints marked ✅ were live-tested. This is the master reference;
> PLAN.md is the strategy summary, PRD/ARCHITECTURE are the build specs.

---

## Part A — What a Carfax report contains (verified from real report PDFs)

Extracted from two actual reports (2020 Hyundai Sonata, 2022 Peterbilt 579) plus Carfax
support pages and litigation records.

### A.1 Sections & fields
1. **Header**: year/make/model/trim, VIN, body, engine, fuel, driveline; Original Window
   Sticker link (MSRP + options); headline flags; summary counts (service records,
   owners, use type, last state, last odometer).
2. **History-Based Value** (dealer reports): retail value adjusted by history events
   (avg accident ≈ −$500; severe ≈ −$2,100); drives listing value badges.
3. **Accident/Damage History**: per event — date, "Accident" vs "Damage" (non-crash),
   severity **Minor/Moderate/Severe** (definitions printed in glossary), damage-location
   quadrant diagram (FRONT/LEFT/RIGHT/REAR), functional/structural flags, airbag
   deployment line. "Not all accidents / issues are reported to CARFAX" appears 3×.
4. **Additional History panel** (per owner): Total Loss · Structural Damage · Airbag
   Deployment · Odometer Check (rollback) · Accident/Damage · Manufacturer Recall ·
   Basic Warranty (est. remaining).
5. **Title History (guaranteed)**: damage brands **Salvage | Junk | Rebuilt | Fire |
   Flood | Hail | Lemon**; odometer brands **Not Actual Mileage | Exceeds Mechanical
   Limits**. Guarantee covers only US state DMV-issued brands, 1 year.
6. **Ownership History (estimated)**: per owner — year purchased, type (Personal,
   Personal Lease, Commercial, Fleet, Rental, Taxi, Livery, Police, Government), length,
   states, est. miles/yr, last odometer. Post-1991, US-titled only. Dealer-title states
   (ME MA NJ OH OK PA SD) can inflate counts.
7. **Detailed History timeline** (per owner; Date|Mileage|Source|Comments): manufactured/
   shipped, MSRP, purchase reported, title issued/updated + title #, registration
   issued/renewed, color noted, lien reported/released, vehicle serviced (itemized
   lines), emissions/safety inspection, accident/damage events, theft/recovery,
   repossession, offered for sale, sold at auction, exported/imported, duplicate title,
   odometer-exempt, connected-services entries. Sources shown: OEM, DMVs (+city+title#),
   named shops (+ratings), anonymized "Damage Report".
8. **Warranty Check appendix**: estimated start date; table Basic/Drivetrain/Emissions/
   Corrosion/Transferable/Roadside/Restraints/Specific Components — original vs
   estimated remaining.
9. **Badges**: 1-Owner, No Accidents Reported, Well-Maintained/Service History, Personal
   Use, Open Recall, value badges, CPO.

### A.2 Carfax's acquisition machine (see CARFAX_SUPPLY_CHAIN.md for full detail)
Cash (bulk DMV purchases, millions/yr) · barter (≈5,400 police agencies get free tools
for crash data; shops get advertising for repair orders) · infrastructure capture
(operates the OEM alliance's VIN recall service, VRSS) · corporate inheritance (R.L.
Polk registration census; CarProof/Carfax Canada insurer connections). Known blind
spots: unreported accidents; Manheim/ADESA structural announcements (AutoCheck
exclusive); voluntary insurer participation; service records only from opted-in shops;
NMVTIS beats Carfax on title brands (mandatory reporting; Carfax isn't even a consumer
NMVTIS provider).

---

## Part B — Federal & public APIs (all free) ✅ live-tested

### B.1 NHTSA vPIC — VIN decode
- `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json&modelyear={y}`
  → flat record, **154 fields** (make/model/trim/series, engine incl. HP/displacement/
  config, plant, GVWR, curb weight, body, doors, drive, transmission, ABS/ESC/TPMS,
  airbag locations, ADAS equipment, EV fields, BasePrice, ErrorCode/ErrorText check-digit
  validation, SuggestedVIN).
- Batch: `POST /DecodeVINValuesBatch/` body `DATA=vin,year;…` — **max 50 VINs/call**.
- Partial VINs supported (`*` wildcard). No key, no daily cap; soft "traffic rate
  control" — run bulk jobs nights/weekends ET.
- **Self-host option**: monthly standalone DB at `https://vpic.nhtsa.dot.gov/Downloads` —
  PostgreSQL 17 dump (~70 MB) incl. decode stored procedures. Use this as primary;
  API as fallback. Decode confidence ~99% MY1995+, 60–65% 1980–94, none pre-1980.

### B.2 NHTSA recalls
- `GET https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=` → fields:
  NHTSACampaignNumber, ReportReceivedDate, Component, Summary, Consequence, Remedy,
  PotentialNumberofUnitsAffected, parkIt, parkOutSide, overTheAirUpdate.
- Menus: `api.nhtsa.gov/products/vehicle/{modelYears|makes|models}?issueType=r`.
- **No public VIN-level route** (probed `recallsByVin`, `vinLookup` → 403). The nhtsa.gov
  VIN tool is manufacturer-fed (49 CFR 573.15 mandates each OEM run a free weekly-updated
  VIN lookup) and Akamai-walled. → Product approach: show campaigns filtered by build
  window + deep-link OEM checkers (ford.com/support/recalls, toyota.com/recall,
  owners.honda.com/recalls, my.gm.com/recalls, nissanusa.com/recalls-vin, etc.).
- Bulk: ODI recall flat files (below) include **BGMAN/ENDMAN manufacture-date ranges** —
  lets us narrow campaigns to the VIN's plant build window.
- Canada: Transport Canada VRDB —
  `https://vrdb-tc-apicast-production.api.canada.ca/eng/vehicle-recall-database/v1/recall/make-name/{make}/year-range/{a}-{b}`,
  free key via tc.api.canada.ca sent as `user-key` header.

### B.3 NHTSA complaints / investigations / TSBs
- `GET https://api.nhtsa.gov/complaints/complaintsByVehicle?make=&model=&modelYear=` →
  odiNumber, crash/fire booleans, injuries/deaths, dates, components, summary, and
  **`vin` truncated to 11 chars** → squish-VIN match against subject VIN = vehicle-line
  specific complaint hits.
- Undocumented but live: `GET https://api.nhtsa.gov/safetyIssues?…` and
  `/safetyIssues/byNhtsaId?nhtsaId=` → complaints+recalls+investigations+
  manufacturerCommunications (TSB metadata) in one response. Unstable; don't depend.
- **ODI flat files (the workhorse)** — S3, no auth, **refreshed daily**:
  `https://static.nhtsa.gov/odi/ffdd/{cmpl,rcl,inv,tsbs}/` — complaints 1995→ (370 MB,
  incl. truncated VIN), recalls 1967→ (29-field schema), investigations, TSB metadata
  w/ 4,000-char summaries. Schemas in `CMPL.txt`/`RCL.txt`/`INV.txt`/`TSBS.txt`. Ignore
  the stale data.transportation.gov Socrata mirrors (dead since ~2018).

### B.4 NCAP safety ratings
- `GET https://api.nhtsa.gov/SafetyRatings/modelyear/{y}/make/{m}/model/{mo}` → variants
  → `GET /SafetyRatings/VehicleId/{id}` → overall/front/side/pole stars, rollover rating
  + possibility, crash-test photo/video URLs, ADAS availability, plus per-variant
  ComplaintsCount/RecallsCount/InvestigationCount.
- IIHS: official API at api.iihs.org requires approval (realistic for consumer-info
  products; display requirements apply). Apply in Phase 2.

### B.5 FARS (fatal crashes) — the only public VIN-bearing crash data
- Bulk annual files 1975→ at `https://static.nhtsa.gov/nhtsa/downloads/FARS/{year}/`;
  Vehicle file carries **VIN truncated to 12 chars** (post-1994) + vPIC-decode companion
  files since 2019. Match on first-12 prefix → "possible fatal-crash involvement" flag
  (label as prefix match; rare collisions). ~40k crashes/yr.
- CrashAPI (`crashviewer.nhtsa.dot.gov/CrashAPI`) exists but **403-blocks datacenter
  IPs** — use bulk files. CISS/CRSS public files have VINs redacted — model-level only.
- All other public crash open data **deliberately strips VINs** — verified against NYC
  (dataset bm4k-52h4), Texas CRIS public extract (spec grepped: no VIN; the
  government-only extract has it), Iowa DOT, Maryland. Individual police reports
  ($6–$32, DPPA-gated) are the only full-VIN artifacts. **Conclusion: no free VIN-keyed
  non-fatal accident dataset exists in the US.**

### B.6 EPA fueleconomy.gov
- `https://www.fueleconomy.gov/ws/rest/vehicle/menu/{year|make|model|options}` →
  vehicle id → `GET /ws/rest/vehicle/{id}` (~90 fields: city08/highway08/comb08, CO2,
  fuel cost, EV range + charge times, ghgScore, emissions per sales area). Send
  `Accept: application/json`. Bulk: `https://www.fueleconomy.gov/feg/epadata/vehicles.csv`.
  Not VIN-keyed — map from vPIC decode (fuzzy on displacement + transmission).

### B.7 International reference (for later expansion)
- **UK DVSA MOT History API** — the model the US lacks: free registration, OAuth2 +
  X-API-Key, `GET https://history.mot.api.gov.uk/v1/trade/vehicles/vin/{vin}` → full
  inspection history **with odometer readings** and defects; 15 rps, 500k/day. Bulk
  download available. (UK DVLA VES: plate-level tax/MOT status; signups currently paused.)
- **France Histovec** (histovec.interieur.gouv.fr) — official free history (title events,
  mileage, admin status), owner-initiated share; relevant if a French version is built.

---

## Part C — Title / brands / total loss / odometer (NMVTIS + states)

### C.1 NMVTIS
- Anti-Car Theft Act 1992; 28 CFR Part 25; DOJ oversight, **AAMVA operates**. The only
  DB that **all states, insurers (monthly), junk/salvage yards (monthly)** must report
  into. Consumer report contains: current + prior titles (state/date), **odometer at
  every title issuance**, ~60 standardized brands, insurer total-loss determinations
  (even without a state brand — catches title-washing), salvage-yard possession records.
  **Never contains owner PII** (prohibited).
- Brand vocabulary (families): damage (Flood/Fire/Hail/Salt Water/Vandalism/Collision),
  salvage (Salvage:Damage/Stolen/Other, Totaled, Owner Retained, Recovered Theft),
  destruction (Junk/Dismantled/Crushed/Non-repairable/Export Only), rebuild (Rebuilt/
  Reconstructed/Refurbished/Kit/Replica), lemon (Manufacturer Buy Back, defect
  corrected/uncorrected, Warranty Return), prior-use (Taxi/Police/Rental/Agricultural/
  Logging/Test), 10 odometer brands, admin (Gray Market/Antique/Classic/Bond Posted/
  VIN Replaced…).
- **Fee-funded by statute** — no free API can ever exist. Wholesale ≈ $1/report →
  ~$0.25 at volume (VinAudit-class API). Provider contracts **prohibit caching /
  reselling / derivative databases** of responses.
- **The free path**: **Carsforsale.com is a DOJ-approved consumer provider giving 100%
  free NMVTIS reports** (`carsforsale.com/free-vehicle-history-reports`) — including
  prior listing photos/price history. Cloudflare-protected; ToS bans scraping → **link
  out only**. Other approved consumer providers + retail prices: VINData $3.49,
  CheckThatVIN $3.50, VINSmart ~$5–9.95, TitleCheck.us $9.98, VinAudit $9.99 (API
  cheapest wholesale), EpicVIN/ClearVin/Bumper higher. CARFAX itself: commercial-only,
  California-only provider.

### C.2 State free lookups — title/brand/lien
| State | Tool | Returns / notes |
|---|---|---|
| Florida | MVCheck `services.flhsmv.gov/MVCheckWeb/` | Title status, brands (salvage/flood/junk/bonded/lemon), **odometer readings**, liens, theft. Bot-hostile (403s) → link-out or careful low-volume |
| Ohio | `bmvonline.dps.ohio.gov/bmvonline/titles/titlesearch` (pattern `…/gettitlesbyvin?vin=`) | OH titles, status, liens, odometer-at-title. Very scrapable. NMVTIS-sourced out-of-state brands excluded |
| New York | `process.dmv.ny.gov/titlestatus/` (VIN+year+make) | Title issue date, lien count, lienholder |
| Massachusetts | mass.gov RMV title status (last-8 VIN) | Title status + lienholder |
| Colorado | myDMV title status (VIN + sale date) | Title status |
| Wisconsin | wisconsindot.gov title search | Needs owner identifier → skip |
| Connecticut | DMV lien inquiry portal | Lien status only |
| Kentucky | OVIS — $75/yr + $0.44/record, **DPPA authorization required** | Cheapest quasi-bulk state feed if qualified |

### C.3 State free lookups — inspection/emissions (odometer on the VIR)
| State | Tool | Notes |
|---|---|---|
| **New York** | **Open dataset `vezn-fmmk` on data.ny.gov** ✅ | **Full VIN + odometer + safety/emissions results + dates; weekly refresh; bulk + Socrata API** (`data.ny.gov/resource/vezn-fmmk.json?vin=`). Companion `w4pv-hbkt`: active registrations by VIN (class, county/ZIP, color, expiry). The best free odometer source in the US — mirror it |
| Texas | mytxcar.org | Emissions continue in 17 counties post-2025 (safety inspections abolished for passenger cars); VIRs incl. odometer; ASP.NET form, historically no CAPTCHA |
| Arizona | myazcar.com (`azvecportal.com…/histinq.exe/muinput`) | Legacy CGI by VIN — very scrapable |
| Colorado | Air Care CO (`coaircarevin.etest.com:302/cgi-bin/CO-GETHISTORYBYVIN.COM`) | Direct CGI takes VIN — very scrapable |
| California | BAR smog history `bar.ca.gov/inspection` (VIN or plate) | Every CA smog test: date, station, result |
| Maryland | VEIP `mva.mdveip.com` (VIN or plate) | Test results |
| New Jersey | `pweb.nj-cleanair.com/VIRPrint/…` | JSF session-heavy, no login |
| Illinois | Air Team VIR reprint `airteam.app/forms/virreprint.cfm` | Lists all VIRs for a VIN |
| Georgia | Clean Air Force VIR lookup (cleanairforce.com) | Atlanta-area; most recent VIR(s) |
| Missouri | GVIP `missourigvip.com/VIR` | St. Louis area |
| Utah | County portals (Utah/Davis/SL/Cache/Weber) | Fragmented |
| Vermont | AVIP `vt-avip.com/VTPublicWeb/testHistory` | |
| Virginia | virginiavip.org + rapidpassvirginia.com | Safety + NoVA emissions |
| Massachusetts | mavehiclecheck.com VIR (needs VIN+plate) | Harder without plate |
| Wisconsin | wisconsinvip2.org (last 30 months) | VIN or plate |
| No portal | AL AK DE HI ID IN IA KS LA ME MI MN MS MT NE NV NH NM(ABQ only) NC ND OK OR PA RI SC SD TN WA WV WY DC | Records-request only or no I/M program |

Master reference: Illinois Air Team out-of-state links PDF (Aug 2025).

---

## Part D — Accidents / theft / salvage

### D.1 NICB VINCheck (free, constrained)
Binary hit/no-hit: unrecovered theft (≈5-yr window) + salvage/total-loss from insurers
representing **92.49% of earned premium**. No dates/details. **5 lookups/IP/24h**,
Cloudflare managed challenge, per-lookup ToS assent. **Never scrape server-side** —
implement as user-initiated check with instructions. nicb.org/vincheck.

### D.2 Salvage-auction archives (accident + odometer + photo proxy)
- **Clean free bulk**: GitHub **rebrowser/copart-dataset** + **rebrowser/iaai-dataset** —
  daily-updated listing dumps (damage type, title status, mileage, repair cost, sale
  schedule). Ingest daily → own VIN→auction index, compounding forward.
- Free lookup sites (they carry the scraping risk; use as link-outs, don't mirror
  photos): Poctra, BidFax, Stat.vin, bid.cars, PLC.auction, BidHistory.org, autoAstat.
- Paid structured APIs (phase 2 top-up): apiauctions.io (20M+ lots, ~6-min freshness),
  auction-api.app, VehicleDatabases auction-history (80M records).
- **Prohibited**: scraping copart.com / iaai.com (explicit anti-scraping ToS + robots;
  member-gated sales data; Copart sells a formal Image & Data License if ever needed).
  Auction photos are copyrighted — link, don't rehost (active takedown industry exists).

### D.3 Accident signal stack (what replaces police feeds)
1. Auction appearance w/ damage + insurer-seller (≈ accident + probable total loss)
2. NMVTIS total-loss (via free link-out / paid API)
3. NICB user-initiated check
4. FARS 12-char prefix match (fatal only, labeled)
5. Squish-VIN complaints with crash=true/fire=true
6. Structural-announcement disclosure: Manheim/ADESA announcements are AutoCheck-
   exclusive — a blind spot for Carfax AND us; disclose it.

---

## Part E — Service, listings, ownership, stickers, warranty, value

### E.1 Service records (the moat — no free equivalent exists)
Carfax Service Network: 24k+ shops, Reynolds & Reynolds DMS interface [confirmed],
Toyota dealer network via Service Link (2020) [confirmed]; data contractually locked,
never resold. Free strategy:
- **Guided self-check by brand**: Toyota/Lexus (toyota.com/owners — full dealer history
  after free VIN-add) · Honda/Acura (owners.honda.com — same) · Hyundai/Kia (partial:
  warranty + milestones) · Ford (OASIS — dealer-only; any dealer prints free on request)
  · GM/Nissan/BMW/Mercedes (not exposed; dealer phone call). **Do not automate** —
  portals assert ownership; ToS.
- **Crowdsourced vault**: owner-uploaded receipts keyed to VIN, odometer-photo
  verification, history transfers with the car. The only legal path to data Carfax
  doesn't own; cold-start mitigated by the free-report funnel.
- Always show **OEM maintenance schedule vs. evidence** ("should have had X by 60k").

### E.2 Listing history (odometer + price + photos over time)
- **MarketCheck VIN History API** — every online listing seen for a VIN (dates, price
  changes, mileage, dealer, photos). **500 free calls/mo**, 5/s; $0.006/call at volume
  ($299/mo Basic). The closest thing to "Carfax timeline as an API."
- **Auto.dev** — 1,000 free calls/mo, listings + VIN decode + specs + recalls proxy.
- iSeeCars free VIN report (iseecars.com/vin) — excellent free display of prior listings
  incl. photos; web-only, no API → link-out/reference.
- Store every VIN ever queried → build our own longitudinal archive.

### E.3 Ownership estimate
Count listing episodes (each dealer-listing → disappearance ≈ sale) + geographic jumps +
NY registration data + NMVTIS title trail (link-out/paid). Output "Estimated owners:
2–3" with the inference basis. Carfax's own count is ±1 (title-event ambiguity;
dealer-title states). Label as estimate, never a count.

### E.4 Window sticker / build sheet by VIN (free)
| Brand | Route | Status |
|---|---|---|
| GM | `https://cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin={VIN}` | Official; ~2018+ |
| Stellantis | `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin={VIN}` (swap brand domain); build sheet `…/webselfservice/BuildSheetServlet?vin={VIN}` | Official; recent VINs |
| Ford/Lincoln | FordDirect-backed sticker system (3rd-party frontends) | ~2016+ |
| Hyundai/Genesis | Official VIN-keyed Monroney | Active |
| Toyota/Lexus, Kia | Public access retired (2026) | Archived copies only |
| BMW/Mini | bimmer.work (flaky), mdecoder (1/day) — build data, not Monroney | Community |
| Mercedes | lastvin.com, mb.vin — datacard | Community |
| Honda, Nissan, VW, Subaru, Mazda, Volvo, Tesla | Never existed | Recreate from decode |
**Rule: fetch once, archive the PDF — endpoints die without notice.** Fallback for all
brands: clearly-labeled recreated spec sheet from vPIC + EPA + specs DB.

### E.5 Warranty estimate
No public in-service-date lookup exists (Ford OASIS has it, dealer-only). Algorithm:
vPIC decode → self-maintained brand/year factory-terms table → in-service ≈ first title
date (NMVTIS) or model year + 6-month lag → subtract estimated current mileage → present
range + "any dealer confirms exact dates free." Same quality level as Carfax's own
estimate.

### E.6 Market value
KBB/Edmunds/JD Power = partner-only; CarGurus IMV API = key-gated. Build own: 50–200
comps from Auto.dev/MarketCheck free tiers → mileage-depreciation regression → median +
IQR "market range" **with visible comps**; apply history adjustments (salvage −, 1-owner
+) with published weights. Optional cross-check: MarketCheck price prediction
($0.07–0.13/call).

### E.7 Specs page fillers
Trim features: CarAPI (free 2015–2020 dataset; $199–299/yr full) · make/model lists:
GitHub datasets (abhionlyone/us-car-models-data etc.) · vPIC + EPA covers ~80% free.

---

## Part F — Rate-limit & cost budget (free tier)

| Source | Budget | Cost |
|---|---|---|
| vPIC | self-hosted dump = unlimited; API fallback soft-capped | $0 |
| NHTSA api.nhtsa.gov | unpublished; cache aggressively | $0 |
| ODI/FARS/EPA bulk | nightly/annual mirrors | $0 |
| NY Socrata | free app token; weekly bulk mirror | $0 |
| State portals | per-VIN on demand, per-state politeness caps, cache 30–90 days | $0 |
| MarketCheck | 500 calls/mo → ~16 fresh VIN-histories/day; cache forever (own archive) | $0 → $0.006/call |
| Auto.dev | 1,000 calls/mo (comps) | $0 |
| rebrowser datasets | daily pull | $0 |
| OEM stickers | once per VIN, archived | $0 |
| Transport Canada | per-key portal limits | $0 |
| NICB, Carsforsale, OEM recall checkers | user-initiated only — zero server calls | $0 |
| NMVTIS (phase 3 add-on) | user-triggered, never cached | ~$0.25–1.00/VIN |

At free tiers the product supports roughly **15–30 fully-fresh reports/day** (MarketCheck
is the binding constraint); cached/partial reports are unlimited. Every served report
enriches the local archive, so marginal cost falls over time — the same compounding
Carfax exploited for 40 years.
