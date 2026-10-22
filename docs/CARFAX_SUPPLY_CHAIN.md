# How Carfax Actually Gets Its Data — Information Taxonomy & First-Hand Provider Map

> Companion to [PLAN.md](./PLAN.md). Research date: 2026-08-23, including a dedicated
> verification pass on supply-chain claims (corporate filings, press releases, litigation
> records, Carfax's own B2B marketing). Confidence is labeled per claim:
> **[C]** confirmed by primary/first-party source · **[P]** partially confirmed ·
> **[I]** inferred (plausible, undocumented) · **[R]** refuted common belief.

---

## 1. The acquisition machine: four mechanisms, one flywheel

Carfax (founded 1984, Columbia MO, by Ewin Barnett III and Robert Daniel Clark, starting
from Missouri title records; owned by R.L. Polk 1999→, IHS 2013→, S&P Global 2022→, and
since **July 1, 2026 part of the spun-off Mobility Global, Inc. — NYSE: MBGL**) does not
have one data strategy. It has four:

### Mechanism A — Cash purchase (the DMV backbone)
States sell bulk title/registration records under DPPA permissible-use carve-outs, and
**Carfax pays cash — "millions in 2024 buying data from DMVs"** per state records obtained
by InvestigateTV [C]. This is a legal, priced market: 23 states collected $282M+ selling
motor-vehicle data in FY2024 (GA $53M, CA $49M, IN $25M, OH $20M); pricing runs from
~$5/request to $7,500 per bulk file to negotiated contracts. LexisNexis is actually the
bigger buyer in most states — Carfax is one customer of a functioning market. [C]

### Mechanism B — Barter (data in exchange for free tools/exposure)
- **Police**: "Carfax for Police" — in Carfax's own words: *"In exchange for
  agency-provided accident data, partners get FREE access to the Investigative Tools and
  our suite of Traffic and Records solutions."* 5,000–5,400 "data-sharing" law-enforcement
  agencies. Carfax also runs **CrashDocs.org** (built by Carfax in July 2014 — it did
  **not** acquire PoliceReports.US; **LexisNexis bought that**, Aug 4 2014 [R]), which
  hosts/distributes crash reports for agencies at zero cost and monetizes report sales.
  A Feb 2025 class action targets exactly this monetization. [C]
- **Service & repair shops**: membership in the Carfax Service Network is free; the
  payment is exposure — the shop's name, phone, and ratings appear on every report
  containing its records, plus co-branded service reminders. [C]

### Mechanism C — Infrastructure capture (become the industry's plumbing)
- **Recalls**: Carfax **built and operates the Vehicle Recall Search Service (VRSS)** for
  the OEM alliance (Alliance for Automotive Innovation, ~98–99% of US automakers), live
  since March 2018: free bulk VIN recall checks (10k VINs/query) for DMVs, insurers,
  dealers, fleets — 10+ billion checks, used by 8 state DMVs. Operating the pipe means
  Carfax interfaces directly with every manufacturer's VIN-level open-recall system. [C]
- **Distribution exclusivity reinforcing the flywheel**: exclusive VHR deals with
  Autotrader, Cars.com, and ~40 OEM certified-pre-owned programs (the subject of the
  Maxon v. Carfax antitrust suit — Carfax won, but the exclusives are documented). [C]

### Mechanism D — Corporate inheritance (buy the aggregators)
- **R.L. Polk** (parent 1999–2013): Polk's National Vehicle Population Profile (est. 1976)
  is a quarterly census of every registered vehicle in the US/Canada/PR compiled from
  state registration lists — NHTSA's own FARS uses it. Carfax's registration pipeline is
  in-house family infrastructure. [C for Polk's role; I for internal pipeline sharing]
- **CarProof → Carfax Canada** (bought by IHS Dec 2015 for C$650M): live connections to
  Canadian insurance-industry claims databases (incl. public insurers SGI, and ICBC via
  the "Verified BC" product) plus provincial registries. [C/P]

---

## 2. Complete taxonomy: every information type Carfax holds

Grouped by record class (compiled from real report extractions + Carfax B2B product
sheets). ~36 billion records, 165k+ sources, ~5.9M records added daily (their claims).

| # | Record class | Specific data elements |
|---|---|---|
| 1 | Vehicle identity / build | VIN decode, year/make/model/trim/series, body, engine, driveline, fuel, factory options, original window sticker, MSRP, plant, color as first reported |
| 2 | Title events | Title issued/updated, title number, issuing state, date, duplicate title, title corrections |
| 3 | Title brands | Salvage, Junk, Rebuilt/Reconstructed, Fire, Flood, Hail, Lemon/Mfr Buyback + odometer brands (Not Actual Mileage, Exceeds Mechanical Limits); the guaranteed set |
| 4 | Registration events | Issued/renewed, state, registration class → use type (Personal, Personal Lease, Commercial, Fleet, Rental, Taxi, Livery, Police, Government), odometer-exempt status |
| 5 | Odometer readings | Captured at title transfer, registration, inspection, service visit, auction, listing; rollback/rollback-suspect algorithmic flags |
| 6 | Ownership derivation | Estimated owner count, purchase year per owner, ownership duration, states owned, est. miles/year (computed, not sourced) |
| 7 | Liens & finance | Loan/lien reported, lien released, lienholder presence, repossession |
| 8 | Accident events | Police-reported accidents: date, collision description, severity (Minor/Moderate/Severe), point of impact (front/left/right/rear), functional damage |
| 9 | Damage events (non-crash) | Vandalism, weather, object contact; damage reports from shops/auctions/recyclers |
| 10 | Structural/frame | Structural damage indicators (from body shops, inspections; NOT Manheim/ADESA announcements — those are AutoCheck-exclusive) |
| 11 | Airbag | Deployment / non-deployment per event |
| 12 | Total loss | Insurer total-loss determinations (participating insurers; voluntary) |
| 13 | Theft | Theft reported, theft recovery |
| 14 | Salvage / auction | Salvage-auction listing records, auction sale events, dealer inventory/"offered for sale" listings |
| 15 | Service & maintenance | Itemized repair-order lines (oil change, tires, alignment, PDI, accessories…), servicing shop identity + ratings |
| 16 | Inspections | State emissions/safety inspection events + results |
| 17 | Recalls | Campaigns + VIN-level open (unrepaired) recall status via VRSS |
| 18 | Warranty | Estimated in-service date; per-coverage original terms and estimated remaining (Basic, Drivetrain, Emissions, Corrosion, Roadside, Restraints…) |
| 19 | Usage flags | Commercial/rental/taxi/fleet/government use |
| 20 | Import/export | Gray-market import notations, export records |
| 21 | Lemon/buyback | State lemon-law and manufacturer repurchase records |
| 22 | Connected-car | OEM telematics/marketing events (e.g., "Blue Link available") |
| 23 | Valuation | History-Based Value per VIN + value badges (derived product) |
| 24 | Crash-report documents | Actual police report PDFs sold via CrashDocs/CarfaxForClaims (a separate monetized asset) |

---

## 3. First-hand provider map (who originates each record, and how Carfax gets it)

| Record class | First-hand originator | Acquisition mechanism | Confidence |
|---|---|---|---|
| Title, brands, registration, liens, odometer-at-title | **State DMVs (50+DC+PR)** | Bulk purchase under DPPA (cash, millions/yr); Polk-heritage registration census | **[C]** |
| Canadian equivalents | Provincial registries + Canadian insurers (SGI, ICBC confirmed) | CarProof acquisition; live insurer-DB connections | [C/P] |
| Accidents (police) | **~5,400 law-enforcement agencies** | Barter: free Carfax for Police tools + CrashDocs hosting ⇄ agency crash data | **[C]** |
| Accidents/damage (insurer side), total loss | Insurance companies (none ever publicly named; "300+ insurance organizations" are *customers* of Carfax BIG — contributor list secret) | Undocumented; plausibly claims-tools-for-data exchange; NOT via Verisk/ISO ClaimSearch (no evidence) | [P/I] |
| Damage (body shops) | Collision repair facilities, OEM-certified networks | Direct participation (Repair Advantage); Carfax **explicitly denies** taking data from CCC/Mitchell/Solera estimating aggregators | **[C for denial]** |
| Structural announcements at wholesale auction | Manheim, ADESA | **Not Carfax** — flows to Experian AutoCheck ("4.5M+ exclusive auction announcements"); Carfax's documented blind spot | **[C]** |
| Salvage-auction records | Salvage/independent auctions (unnamed; Copart/IAA never confirmed) | Direct feeds, terms unpublished | [P] |
| Service records | **Franchised dealers + 24k+ independent shops** | Barter (exposure); DMS pipes: Reynolds & Reynolds Certified Interface [C]; Toyota dealer network via Service Link since Jan 2020 [C] (not 2016); Tekmetric reported [P]; CDK/Mitchell 1/Shop-Ware/NAPA TRACS unconfirmed; chains (Jiffy Lube, Firestone, Valvoline) location-inconsistent [P] | [C/P] |
| Open-recall status (VIN-level) | **Vehicle manufacturers** | Infrastructure capture: Carfax operates VRSS for the OEM alliance | **[C]** |
| Build data / window sticker / warranty schedules | Manufacturers + corporate-family catalog data (Polk/S&P Mobility heritage) | OEM relationships + inheritance | [P/I] |
| Inspections/emissions | State I/M programs & inspection stations | Via state data purchase + station participation | [P] |
| Theft | Law enforcement + DMV theft titles | Police barter + DMV purchase | [P] |
| Fleet/rental/taxi flags | Mostly **derived from DMV registration class**; no rental company (Enterprise/Hertz/Avis) ever confirmed as a reporter; rental firms self-insure so damage often never generates any record anywhere | [P — derivation confirmed, direct feeds unconfirmed] |
| Lemon/buyback | State consumer-protection agencies + OEM disclosures | Purchase/participation | [P] |
| Listings/inventory | Dealers (Carfax's own listings business + syndication) | Own platform | [C] |
| NMVTIS | Carfax IS an approved NMVTIS provider — but **commercial-only, California-only** (exists to serve CA Veh. Code §11713.26 dealer-compliance checks) | AAMVA license | **[C]** |

### Corrections to common beliefs surfaced by verification
1. Carfax never acquired PoliceReports.US — LexisNexis did (2014). Carfax built CrashDocs.org itself.
2. Toyota's dealer service-data deal is Service Link, announced late 2019/Jan 2020 — not 2016.
3. Carfax explicitly denies sourcing from collision-estimating aggregators (CCC/Mitchell): body-shop data is own-network only.
4. No insurer has ever been publicly named as a Carfax data contributor; "insurance companies" is asserted only in aggregate.
5. Rental "damage history" is a structural industry gap — self-insured rental damage typically produces no claim record for anyone.
6. Since July 1, 2026, Carfax's parent is Mobility Global, Inc. (MBGL), spun off from S&P Global.

---

## 4. What this means for VinOrbits

Sort Carfax's pipes by whether the **first-hand originator** is reachable without Carfax:

| Originator | Reachable by us? | Our route (see PLAN.md) |
|---|---|---|
| State DMVs | 🟡 Yes, at a price — the same DPPA bulk market Carfax buys from ($5/request → bulk contracts); free per-VIN portals in ~6 states | State portals free; bulk purchase = future option |
| NMVTIS reporters (states, insurers, junkyards — federally mandated) | 🟡 Yes — via approved providers; free via Carsforsale link-out | Stronger than Carfax's own title data (Carfax isn't a consumer NMVTIS provider) |
| Manufacturers (recalls) | ✅ Campaign-level free (NHTSA); VIN-status via OEM lookups | Deep-links; VRSS itself accepts approved commercial/government users — worth an application long-term |
| NHTSA (complaints/TSBs/investigations/FARS/NCAP) | ✅ Fully open | Ours free; Carfax doesn't even display most of it |
| Police agencies | 🔴 No — 5,400 individual barter relationships; open crash data strips VINs | Proxy stack (auction appearance, NICB, FARS, total-loss) |
| Insurers | 🔴 No — voluntary, secret, relationship-based | NMVTIS total-loss (mandatory reporting!) partially substitutes |
| Dealers/shops (service) | 🔴 No — 24k opted-in shops + DMS integrations | OEM-portal self-check guides + crowdsourced vault |
| Salvage auctions | 🟡 Indirectly — public lot listings (rebrowser datasets, aggregators) | Daily ingest; arguably fresher than Carfax's feed |
| Wholesale auctions (Manheim/ADESA) | 🔴 No — and neither can Carfax (AutoCheck exclusive) | Disclose as everyone's blind spot |

Key strategic insight: **Carfax's edge is not data genius — it is 40 years of accumulated
bilateral relationships (police barter, shop network) plus purchased DMV feeds.** The
federally *mandated* datasets (NMVTIS, NHTSA) are open or nearly open, and on title brands
NMVTIS is stronger than Carfax. The relationship-locked pipes (police, insurers, shops)
are exactly the two gaps PLAN.md §2.6/§2.10 works around — and no competitor, free or
paid, has ever closed them either (AutoCheck substitutes auction announcements for police
depth; everyone else resells NMVTIS).
