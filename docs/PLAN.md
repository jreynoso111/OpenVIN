# VinOrbits — Free Carfax-Equivalent Report: Data Sourcing Plan

> Planning document only — no implementation. Research date: 2026-08-23.
> Method: parallel deep-research passes over (a) two real Carfax report PDFs (full text
> extracted), (b) every relevant government API (live-tested), (c) NMVTIS regulations and
> provider pricing, (d) state DMV/inspection portals, (e) auction/theft/crash data sources,
> and (f) commercial listing/spec APIs with free tiers.

---

## 0. Executive summary — what "free with ALL the same information" really means

A Carfax report is ~15 data categories. With free sources you can reach **genuine parity on
~10 of them**, **near-parity via a free link-out or cheap proxy on 3**, and there are **2
structural gaps nobody can close for free** because the underlying data is proprietary or
fee-funded by federal statute:

| Verdict | Categories |
|---|---|
| ✅ Full parity, free APIs | VIN decode/specs, recalls, complaints/TSBs/investigations, safety ratings, fuel economy, window sticker (GM/Stellantis/Ford/Hyundai), warranty *estimate*, market value (self-computed), fatal-crash flag, theft/salvage flag (user-initiated NICB) |
| 🟡 Near-parity, free but partial or link-out | Title brands + total loss + odometer-at-title (**Carsforsale.com serves free NMVTIS reports** — link out; or $0.25–$1/VIN wholesale via VinAudit API), odometer history (free in ~15 states via inspection portals; NY is bulk open data with full VINs), ownership count (inferred, ±1) |
| 🔴 Structural gaps | **Non-fatal accident records** (police/insurer feeds are purchased under exclusive deals; open crash data deliberately strips VINs) and **dealer service records** (Carfax's proprietary 24k-shop network; no legal resale channel exists) |

Even Carfax has holes: it misses accidents never reported to police/insurers, misses
Manheim/ADESA auction structural-damage announcements (those go exclusively to AutoCheck),
and is not an approved NMVTIS consumer provider — NMVTIS actually beats Carfax on title
brands because reporting into it is federally mandatory. Our report should say what it
covers and what it can't, which is more honest than Carfax's fine print.

Strategy in one sentence: **federal/state open data as the backbone, salvage-auction
archives + listing-history APIs as the accident/odometer proxy, free NMVTIS link-out for
guaranteed title data, and crowdsourced owner-uploaded service records as the long-term
moat.**

---

## 1. What a Carfax report contains (verified against two real reports)

### 1.1 Header / summary
Year-make-model-trim, VIN, body style, engine, fuel, driveline · link to Original Window
Sticker (MSRP + factory options) · headline flags ("Accident reported: moderate damage") ·
summary counts (service records, previous owners, owner type, last state, last odometer).

### 1.2 History-Based Value (dealer reports)
Retail value adjusted by history events (accidents ≈ −$500 avg, severe ≈ −$2,100), drives
the "Great/Good/Fair Value" listing badges.

### 1.3 Accident / Damage History
Per event: date · "Accident" vs "Damage" (non-crash: vandalism, weather, objects) ·
severity scale **Minor / Moderate / Severe** (definitions printed in glossary) · damage
location diagram (FRONT/LEFT/RIGHT/REAR quadrants) · functional/structural damage flags ·
airbag deployment line. Caveat printed 3×: "Not all accidents / issues are reported to
CARFAX."

### 1.4 Additional History panel (per owner)
Total Loss · Structural Damage · Airbag Deployment · Odometer Check (rollback indicator) ·
Accident/Damage · Manufacturer Recall · Basic Warranty (est. remaining months/miles).

### 1.5 Title History (the *guaranteed* section)
Damage brands: **Salvage | Junk | Rebuilt | Fire | Flood | Hail | Lemon**.
Odometer brands: **Not Actual Mileage | Exceeds Mechanical Limits**.
Guarantee covers *only* brands issued by a US state DMV. (NMVTIS tracks ~60 standardized
brands — a superset.)

### 1.6 Ownership History (estimated)
Per owner: year purchased · type (Personal, Personal Lease, Commercial, Fleet, Rental,
Taxi, Livery, Police, Government) · length of ownership · states owned in · est.
miles/year · last odometer. Rules: post-1991 vehicles, US-titled only; dealer-title states
(ME MA NJ OH OK PA SD) can inflate counts.

### 1.7 Detailed History timeline (per owner)
Columns: Date | Mileage | Source | Comments. Event types: manufactured/shipped, MSRP,
purchase reported, title issued/updated, registration issued/renewed, color noted,
lien reported/released, vehicle serviced (itemized: oil change, tires rotated, alignment,
inspections, accessories installed…), emissions/safety inspection, accident/damage events,
theft/recovery, repossession, offered for sale, sold at auction, exported/imported,
duplicate title, odometer-exempt, connected-services entries.

### 1.8 Warranty Check appendix
Estimated warranty start date + per-coverage table: Basic, Drivetrain, Emissions,
Corrosion, Transferable, Roadside, Safety restraint, Specific Components — original term
vs estimated remaining.

### 1.9 Badges & extras
1-Owner · No Accidents Reported · Well-Maintained/Service History · Personal Use · Open
Recall flag · value badges · Buyback Guarantee (DMV title brands only, 1 year).

### 1.10 Carfax's sources (~165k claimed, mapped)
State DMVs (titles/registrations/brands/odometer) · Canadian provincial agencies ·
insurance companies (total loss/claims, voluntary participation) · police via "Carfax for
Police" data-barter (free tools in exchange for crash data) · fire departments · collision
& service shops (proprietary Carfax Service Network + dealer DMS feeds) · auctions
(partial — Manheim/ADESA condition announcements go to AutoCheck, not Carfax) ·
rental/fleet companies · manufacturers (build data, warranty, recalls, connected services)
· state inspection/emission stations · import/export companies · NICB/law enforcement
(theft).

---

## 2. Section-by-section sourcing map (Carfax section → our free source)

### 2.1 Vehicle identity & specs — ✅ FREE, full parity
- **NHTSA vPIC**: `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json`
  — 154 fields (make/model/trim/series, engine, plant, GVWR, ADAS equipment, EV fields,
  check-digit validation, error codes). Batch: `POST /DecodeVINValuesBatch/` ≤50 VINs.
  No key, no daily cap (soft traffic control; run bulk jobs nights/weekends ET).
- **Resilience**: monthly standalone vPIC DB (PostgreSQL 17 dump ~70 MB) from
  `https://vpic.nhtsa.dot.gov/Downloads` → self-host decoding, immune to vPIC outages.
- Decode confidence ~99% for MY1995+, 60–65% for 1980–94.

### 2.2 Recalls — ✅ FREE (campaign level) / 🟡 open-recall status
- Campaigns: `GET https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=`
  (defect, consequence, remedy, parkIt/parkOutside/OTA flags). Bulk: ODI flat files
  `https://static.nhtsa.gov/odi/ffdd/rcl/` (1967→, refreshed daily; BGMAN/ENDMAN
  manufacture-date ranges let us narrow campaigns to the VIN's build window).
- Per-VIN *repair status* ("is THIS recall still open on THIS car"): no public API — the
  nhtsa.gov VIN tool is manufacturer-fed and Akamai-walled. Plan: show all campaigns for
  the year/make/model + deep-link the user to the manufacturer's free VIN checker
  (Ford/Toyota/Honda/GM/Nissan/Hyundai/Kia/etc. all mandated to run one free, 49 CFR 573.15).
- Canada: Transport Canada VRDB API (free key, `user-key` header,
  `https://vrdb-tc-apicast-production.api.canada.ca/eng/vehicle-recall-database/v1/`).

### 2.3 Complaints, investigations, TSBs — ✅ FREE (Carfax doesn't even show these)
- `GET https://api.nhtsa.gov/complaints/complaintsByVehicle?make=&model=&modelYear=` —
  complaint records carry an **11-char truncated VIN** → match against our VIN's first 11
  ("squish VIN"). This identifies prefix matches, not the exact 17-character vehicle;
  records include crash/fire/injury flags.
- Bulk (daily refresh, S3, no auth): `https://static.nhtsa.gov/odi/ffdd/{cmpl,rcl,inv,tsbs}/`
  — complaints 1995→ (370 MB), investigations, TSB metadata w/ summaries.
- Bonus differentiator: Carfax shows none of this. We show prefix-matched complaints,
  exact vehicle-line totals, 12 TSBs, and 1 open investigation.

### 2.4 Title history, brands, total loss, odometer-at-title — 🟡 the NMVTIS problem
NMVTIS is the *only* database all states + insurers + junk/salvage yards must report into
(28 CFR Part 25; ~60 brand types, odometer at every title issuance, insurer total-loss
even when no state brand was applied). It is fee-funded **by statute** — no free API can
ever exist. Options, in order:
1. **Free link-out (launch default): Carsforsale.com** — an official DOJ-approved NMVTIS
   provider giving consumers 100% free NMVTIS reports
   (`https://www.carsforsale.com/free-vehicle-history-reports`). We deep-link/refer; we do
   NOT scrape (Cloudflare + ToS). User gets full federal title/brand/total-loss data at $0.
2. **Cheap embedded upgrade (phase 2): VinAudit NMVTIS API** — ~$1/report → ~$0.25 at
   volume. ⚠ Provider contracts prohibit caching/reselling raw NMVTIS responses — reports
   must be fetched per-request, per-user; no shadow database.
3. **Free state-level partials (always on)**:
   - **Florida MVCheck** `https://services.flhsmv.gov/MVCheckWeb/` — title status, brands
     (salvage/flood), odometer readings, liens, theft — free by VIN (bot-hostile; treat as
     user link-out or careful low-volume fetch).
   - **Ohio BMV title search** `https://bmvonline.dps.ohio.gov/bmvonline/titles/titlesearch`
     (pattern `…/gettitlesbyvin?vin=`) — OH titles, liens, odometer. Very scrapable.
   - **NY title/lien status** `https://process.dmv.ny.gov/titlestatus/` (VIN + year + make).
   - **MA RMV title status** (last-8 VIN), **CO myDMV** (VIN + sale date), **WI title
     search** (needs owner identifier — skip).
4. Never: buying one NMVTIS report and serving it to N users (contract violation), or
   becoming an AAMVA-approved provider (possible long-term legitimization path, noted for
   the roadmap).

### 2.5 Odometer history & rollback check — 🟡 strong free coverage, state-shaped
Free odometer readings exist in more places than people realize; rollback detection = same
algorithm Carfax uses (monotonicity check across all dated readings).
- **New York (gold standard)**: Socrata open dataset `vezn-fmmk` on data.ny.gov — **every
  NY inspection with full VIN + odometer + safety/emissions results, weekly refresh,
  bulk-downloadable**. Query: `https://data.ny.gov/resource/vezn-fmmk.json?vin={VIN}`.
  Also `w4pv-hbkt`: active NY registrations by VIN (class, county/ZIP, color, expiry).
  Mirror both locally (free Socrata app token for throughput).
- **State emissions/inspection portals with per-VIN history** (odometer on the VIR):
  TX `mytxcar.org` (emissions continue in 17 counties post-2025) · AZ `myazcar.com`
  (legacy CGI, very scrapable) · CO Air Care (direct CGI endpoint takes VIN) · CA BAR
  smog history `bar.ca.gov/inspection` (VIN or plate) · MD VEIP `mva.mdveip.com` · NJ VIR
  `pweb.nj-cleanair.com` · IL Air Team VIR reprint · GA Clean Air Force · MO GVIP ·
  UT (county portals) · VT AVIP · VA (virginiavip.org + rapidpassvirginia.com) · MA
  (needs plate too) · WI VIP (last 30 months). Master reference: IL Air Team
  out-of-state-links PDF (Aug 2025).
- **Every other reading we can find feeds the same check**: NMVTIS odometer-at-title
  (link-out/paid), auction-lot odometer (§2.7), listing-history mileage (§2.9), NHTSA
  complaint records (mileage field), user uploads.

### 2.6 Accidents & damage — 🔴 structural gap; build the proxy stack
Verified: **no free VIN-keyed non-fatal accident dataset exists in the US.** Public crash
open data (NYC, Texas CRIS public extract, Iowa, MD) deliberately strips VINs; full VINs
only in $6–$32 individual police reports (DPPA-gated). What we CAN do free:
1. **FARS fatal crashes**: bulk files 1975→ carry **12-char VIN prefixes** + vPIC decode
   companions (`https://static.nhtsa.gov/nhtsa/downloads/FARS/{year}/`). Match on first 12
   chars → "possible fatal-crash involvement" flag (label as prefix-match, rare collisions).
2. **Salvage-auction appearance as damage proxy** (§2.7): a Copart/IAAI lot with damage
   type + photos + insurer-seller ≈ accident + probable total loss. This catches most
   serious accidents and is exactly what paid "Carfax alternatives" actually sell.
3. **NICB VINCheck** (theft + total-loss hit/no-hit from insurers = 92.5% of premium):
   free but 5 lookups/IP/day, Cloudflare, click-through ToS. **Never scrape server-side.**
   Implement as a user-initiated step: "Check this VIN on NICB" button with instructions,
   or client-side assisted flow the user performs themselves.
4. **NMVTIS total-loss records** via the free Carsforsale link-out (§2.4).
5. **Squish-VIN complaint matches** with crash=true/fire=true flags (§2.3).
6. **Honest labeling**: an "Accident signals" section listing which of the 5 detectors
   fired, with the same disclaimer Carfax prints — unreported accidents are invisible to
   everyone, including Carfax.

### 2.7 Salvage auctions, damage photos, total-loss inference — 🟡 free-ish, legally tiered
- **Free bulk (cleanest)**: GitHub `rebrowser/copart-dataset` + `rebrowser/iaai-dataset` —
  daily-updated listing dumps (damage type, title status, mileage, repair cost). Ingest
  daily; builds our own VIN→auction-appearance index going forward.
- **Free lookups (medium risk — they scrape upstream)**: Poctra, BidFax, Stat.vin,
  bid.cars, PLC.auction archives — usable as user link-outs; don't mirror their photos
  (auction photos are copyrighted; the "VIN cleaning" takedown industry proves active
  enforcement).
- **Paid per-call (contained risk, phase 2)**: apiauctions.io / auction-api.app /
  VehicleDatabases auction-history API (20M+ archived lots, structured, someone else
  holds the scraping risk).
- **Never**: scraping copart.com/iaai.com directly (explicit anti-scraping ToS, robots
  disallow, member-gated sales data; Copart offers a formal paid Image & Data License if
  we ever want to go legit at scale).

### 2.8 Theft records — 🟡 user-initiated free
NICB VINCheck (see §2.6.3) + theft brands via NMVTIS link-out + FL MVCheck theft flag.
No scraping; 5/day/IP cap is the design constraint. Optional: state stolen-vehicle files
where published.

### 2.9 Ownership history & registration events — 🟡 estimate, clearly labeled
Owner PII is DPPA-protected — Carfax doesn't show names either; they count DMV title
*events* with de-duping heuristics (their own count is ±1). Our free proxy stack:
- **Listing-history episodes**: MarketCheck VIN History API — every online listing ever
  seen for the VIN (dates, prices, mileage, dealer, photos). **500 free calls/month**,
  then $0.006/call. Each listing episode → sale → probable ownership change; geographic
  jumps → state moves.
- **NY registrations dataset** (`w4pv-hbkt`) for NY-registered vehicles.
- **NMVTIS title trail** via link-out/paid (state + date of every title issuance).
- Output: "Estimated owners: 3 (Georgia → Texas → Florida), inference basis shown."
  Label as estimate — never a count.

### 2.10 Service & maintenance records — 🔴 the moat; crowdsource it
Carfax's Service Network (24k+ shops, dealer DMS feeds) is proprietary; nobody resells it.
Plan:
1. **Guided self-check**: instruct users to pull dealer history themselves — Toyota/Lexus
   and Honda/Acura owner portals show full dealer service history after adding a VIN to a
   free account; Ford OASIS via any Ford dealer (free on request); Hyundai/Kia partial.
   We provide per-brand step-by-step instructions (we do NOT automate — ToS + ownership
   assertion).
2. **Crowdsourced record vault (our long-term differentiator)**: owners upload receipts /
   photos keyed to VIN, odometer-photo verification, history transfers with the car.
   Cold-start is real; seed via "get your free report → add your records" loop.
3. **Maintenance *schedule* vs *performed*:** we can always show what SHOULD have been
   done by now (free from OEM schedules) next to what's evidenced.

### 2.11 Warranty check — ✅ free estimate at Carfax's own quality level
Carfax's warranty section is itself an estimate. Algorithm: vPIC decode → brand/year
factory terms table (self-maintained: basic/powertrain/corrosion/roadside/emissions/
restraints) → in-service date = first title date (NMVTIS link-out) or model-year + 6-month
sales-lag estimate → subtract current estimated mileage (from odometer stack §2.5).
Present as range + "any dealer will confirm exact dates from the VIN, free."

### 2.12 Window sticker / build sheet — ✅ free for ~half the market, recreate the rest
- **Official free endpoints (cache PDFs on first fetch — these die without notice):**
  - GM: `https://cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin={VIN}` (~2018+)
  - Stellantis: `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin={VIN}`
    (swap brand domain); build sheet: `…/webselfservice/BuildSheetServlet?vin={VIN}`
  - Ford: FordDirect-backed window-sticker system (~2016+); Hyundai/Genesis: official
    VIN-keyed Monroney.
- Toyota/Lexus + Kia retired public access (2026); Honda/Nissan/VW/Subaru/Tesla never had
  it. BMW (bimmer.work, mdecoder — flaky), Mercedes datacards (lastvin.com, mb.vin).
- Fallback for all: **recreated spec sheet** (clearly labeled) from vPIC + fueleconomy.gov
  + specs DB — same thing commercial "window sticker" sites sell.

### 2.13 Safety ratings, fuel economy, spec page — ✅ free, solved
- NCAP: `https://api.nhtsa.gov/SafetyRatings/modelyear/{y}/make/{m}/model/{mo}` → VehicleId
  → full stars + rollover + crash-test media + complaint/recall/investigation counts.
- IIHS: apply for the official API (`api.iihs.org`, approval realistic for consumer-info).
- EPA: `https://www.fueleconomy.gov/ws/rest/vehicle/menu/…` (Accept: application/json) or
  bulk `https://www.fueleconomy.gov/feg/epadata/vehicles.csv`; map vPIC decode → vehicle id.
- Trim-level features: CarAPI free 2015–2020 dataset; $199/yr for full years if needed.

### 2.14 Market value / History-Based Value — ✅ free, self-computed
KBB/Edmunds/JD Power are partner-only; don't plan on them. Build our own:
Auto.dev listings API (**1,000 free calls/mo**) + MarketCheck (**500 free calls/mo**) →
pull 50–200 comparables (year/make/model/trim, mileage window, radius) → mileage-depreciation
regression → median + IQR as "market range," **showing the comps** (more trustworthy than a
black-box number). Apply history adjustments (salvage signal → −%, 1-owner → +) with
published weights. MarketCheck price-prediction endpoint ($0.07–0.13/call) as optional
cross-check inside the free quota.

### 2.15 Liens, repossession, import/export, fleet/taxi use — 🟡 partial
Liens: NY title/lien status (free), FL MVCheck, OH title search; otherwise NMVTIS
link-out. Prior-use brands (taxi/police/rental) are NMVTIS brand types → link-out/paid.
Import/gray-market: NMVTIS brand + vPIC plant-country mismatch heuristic. Repossession:
no free source (auction seller-type is a weak proxy).

---

## 3. Master free-source catalog (the fetch list)

| # | Source | Access pattern | Key? | Limits | Ingest strategy |
|---|---|---|---|---|---|
| 1 | NHTSA vPIC | REST JSON + monthly Postgres dump | No | Soft throttle; batch ≤50 | Self-host dump, API fallback |
| 2 | NHTSA recalls/complaints/ratings | REST JSON | No | Unpublished | Per-request + cache |
| 3 | NHTSA ODI flat files (cmpl/rcl/inv/tsbs) | S3, daily refresh | No | None | Nightly diff → local DB |
| 4 | FARS bulk (12-char VINs) | Static annual files | No | None | One-time load + annual |
| 5 | fueleconomy.gov | REST + bulk CSV | No | Be polite | Bulk CSV → local DB |
| 6 | NY inspections `vezn-fmmk` / registrations `w4pv-hbkt` | Socrata SODA + bulk | Free token | Shared pool w/o token | Weekly bulk mirror |
| 7 | State emissions portals (TX AZ CO CA MD NJ IL GA MO UT VT VA MA WI) | Web forms, per-VIN | No | Varies; some CGI-simple | On-demand fetch, per-state adapters, aggressive cache |
| 8 | State title portals (FL OH NY MA CO) | Web forms | No | FL bot-hostile | On-demand; FL/GA as link-out |
| 9 | Carsforsale free NMVTIS | Consumer web | No | ToS: no scraping | **Link-out only** (free full NMVTIS for user) |
| 10 | NICB VINCheck | Consumer web | No | 5/IP/day, Cloudflare | **User-initiated only** |
| 11 | rebrowser copart/iaai datasets | GitHub, daily | No | None | Daily ingest → own auction index |
| 12 | OEM window-sticker endpoints (GM, Stellantis, Ford, Hyundai) | Direct URL by VIN | No | Ephemeral | Fetch once, archive PDF |
| 13 | OEM recall VIN checkers | Consumer web | No | ToS | Deep-link per brand |
| 14 | MarketCheck | REST | Free tier | 500/mo, 5/s | Per-request, cache VIN history |
| 15 | Auto.dev | REST | Free tier | 1,000/mo, 5/s | Per-request comps |
| 16 | Transport Canada VRDB | REST | Free key | Portal-managed | Per-request (CA recalls) |
| 17 | IIHS API | REST | Apply | Display terms | After approval |
| 18 | Crowdsourced uploads | Our own | — | — | The long-term moat |

Paid upgrades held in reserve (phase 2+): VinAudit NMVTIS API (~$0.25–$1/VIN, no caching
of raw responses), auction-history APIs (apiauctions.io etc.), CarAPI full-year specs
($199/yr), Kentucky OVIS bulk ($0.44/record, DPPA qualification needed), state bulk title
files (FL sells full DB — DPPA permissible-use certification required).

---

## 4. Legal guardrails (non-negotiable design constraints)

1. **DPPA (18 U.S.C. §2721)**: never display or store owner names/addresses/DL/plate-holder
   identity. Vehicle-centric data (VIN, brands, odometer, inspection results, crash facts)
   is public-safe — same line Carfax walks. $2,500 minimum statutory damages per violation.
2. **NMVTIS (28 CFR Part 25 + provider contracts)**: fee-funded by statute; no caching or
   reselling of provider responses; free access = link-out to an approved free provider
   (Carsforsale). Long-term legit path: become/white-label an approved provider via AAMVA.
3. **Scraping posture** (post-*Van Buren*, *hiQ* endgame): public-page scraping is weak
   CFAA territory but **breach-of-contract killed hiQ** ($500k + delete-everything
   injunction). Tier the sources: government open data (safe) → licensed APIs (safe) →
   simple state CGI portals with no ToS-assent (low) → aggregator link-outs (their risk)
   → Copart/IAAI/NICB/Carsforsale direct scraping (**prohibited in this project**).
4. **Copyright**: auction photos are copyrighted — link, don't mirror. Facts (price,
   damage code, odometer) are not copyrightable.
5. **Product honesty**: every section labels its sources and coverage; estimates are
   labeled estimates. This is also our differentiation vs Carfax's fine-print approach.

---

## 5. Report blueprint (our free report, section by section)

1. **Header**: vPIC decode + photo (from listing history) + headline flags.
2. **Title & brands**: state-portal results shown inline + "Get the full federal NMVTIS
   title report free →" (Carsforsale link-out) + brand explainers.
3. **Accident signals** (labeled proxy): auction-appearance detector, FARS prefix match,
   NICB user-check, squish-VIN crash complaints, total-loss signals — each with
   fired/not-fired status and source.
4. **Odometer timeline**: all dated readings (inspections, auctions, listings, titles,
   user uploads) on one chart + rollback flag if non-monotonic.
5. **Ownership estimate**: episode-inferred owner count, states, est. miles/year.
6. **Listing history**: prior listings with dates, prices, mileage, photos (MarketCheck).
7. **Recalls**: campaigns for the build window + "check open status at [OEM] →".
8. **Complaints / TSBs / investigations**: squish-VIN matches + model-level counts.
9. **Service**: user-uploaded records + "pull dealer history yourself" per-brand guide +
   OEM maintenance schedule vs evidence.
10. **Warranty estimate**: per-coverage table with remaining range.
11. **Window sticker**: original PDF (GM/Stellantis/Ford/Hyundai) or labeled recreation.
12. **Specs / safety / economy**: NCAP + IIHS + EPA + trim features.
13. **Market range**: comps-based value with visible comparables + history adjustments.
14. **Coverage disclosure**: exactly which sources were queried, hit/miss, and what no
    free (or paid) report can see.

---

## 6. Phased roadmap

**Phase 1 — parity core (free-only):** vPIC self-hosted decode · ODI nightly mirrors ·
FARS index · fueleconomy + NCAP · NY open-data mirror · state portal adapters (start: OH,
AZ, CO, TX, NJ, IL — the scrapable ones) · rebrowser auction ingest · MarketCheck/Auto.dev
free tiers · Carsforsale + NICB + OEM link-outs · report assembly + coverage disclosure.

**Phase 2 — depth:** remaining state adapters · window-sticker archive · IIHS approval ·
comps-based valuation model · crowdsourced upload vault + odometer-photo verification.

**Phase 3 — optional paid add-on inside a free product:** embedded NMVTIS via VinAudit
(~$0.25–$1/VIN, user-triggered, never cached) · paid auction-history API top-up · explore
AAMVA approved-provider status.

**Ops notes:** every VIN ever queried gets its assembled evidence stored (our own
longitudinal DB compounds like Carfax's did) · per-source circuit breakers (state portals
and OEM endpoints die randomly) · all external fetches per-VIN fan out in parallel with
per-source timeouts · respect every rate limit in §3 as a hard cap.
