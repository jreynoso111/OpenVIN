# PRD — HighView: Free Vehicle History Reports

## 1. Vision & positioning

**"The honest free report."** Enter a VIN, get the most complete vehicle history legally
assemblable from free sources — with every section labeled by source and coverage,
including explicit disclosure of what no report (free or paid) can see. Transparency is
the brand: Carfax buries "not all accidents are reported" in fine print; we make coverage
disclosure a headline feature.

- **Users**: US used-car buyers (primary), private sellers proving history (secondary),
  car enthusiasts researching VINs (tertiary — high-volume SEO audience).
- **Price**: free. No account required for a report. Account only for saved garage /
  uploads / alerts.
- **Explicit non-goals (v1)**: no owner PII ever; no NMVTIS resale; no paid tier
  (a user-triggered NMVTIS add-on is Phase 3, at-cost); no dealer B2B tooling.

## 2. Product principles

1. **Coverage honesty** — every section shows: sources queried, hit/miss, and what that
   section *cannot* see. A "Coverage" score/panel is a first-class report section.
2. **Evidence over verdicts** — show the odometer readings, the comps, the auction
   record; never a bare number without its provenance.
3. **Estimates labeled as estimates** — owners, warranty, value.
4. **Guide, don't fake** — where data is user-obtainable only (NICB, NMVTIS free report,
   OEM service history, OEM recall status), give a guided step with a deep link, not a
   scraped imitation.
5. **Every report compounds the archive** — each VIN queried permanently enriches the
   local evidence store (respecting per-source caching rules in LEGAL.md).

## 3. Feature list

### 3.1 MVP (Phase 1)
| # | Feature | Notes |
|---|---|---|
| F1 | VIN input + validation | Check-digit validation via vPIC; partial-VIN error help; plate→VIN out of scope v1 |
| F2 | Report: **Vehicle identity** | vPIC decode (self-hosted), engine/plant/equipment; recreated spec sheet |
| F3 | Report: **Title & brands** | Inline results from state portals (OH, NY, MA, CO; FL as link-out) + prominent guided step: "Get your free federal NMVTIS title report →" (Carsforsale) with an explainer of the ~60 brand types |
| F4 | Report: **Odometer timeline + rollback check** | All dated readings on one chart (state inspections, NY dataset, auction records, listings, complaints); non-monotonic → rollback flag with the two conflicting readings shown |
| F5 | Report: **Accident signals panel** | 6 detectors, each fired/not-fired with source: auction appearance, NMVTIS-total-loss (guided), NICB (guided), FARS prefix, crash-flagged complaints, structural-announcement disclosure |
| F6 | Report: **Salvage/auction history** | Events from rebrowser-derived index: date, damage type, title status, mileage, sale info; link-out to aggregator page for photos (no photo rehosting) |
| F7 | Report: **Recalls** | Campaigns filtered by build window (BGMAN/ENDMAN); per-brand deep link "check open status for THIS VIN at [OEM] →" |
| F8 | Report: **Complaints / TSBs / investigations** | Squish-VIN complaint matches (crash/fire flagged) + model-level counts + TSB list — a section Carfax doesn't even offer |
| F9 | Report: **Listing history** | MarketCheck VIN history: dates, prices, mileage, dealer, photos (hotlink per API terms); "days on market" stats |
| F10 | Report: **Ownership estimate** | Episode-inferred count + state chain + est. miles/yr, inference basis shown |
| F11 | Report: **Specs / safety / economy** | NCAP stars + rollover, EPA MPG/CO2/fuel cost, trim features |
| F12 | Report: **Warranty estimate** | Per-coverage table with remaining range + "verify at any dealer, free" |
| F13 | Report: **Window sticker** | Original PDF (GM/Stellantis/Ford/Hyundai, archived on first fetch) or labeled recreation |
| F14 | Report: **Market range** | Comps-based value with visible comparables + history adjustments |
| F15 | Report: **Service section (v1)** | Per-brand guided self-check instructions + OEM maintenance schedule vs. evidence table |
| F16 | **Coverage disclosure panel** | Sources queried / hit / miss / can't-see; the honesty centerpiece |
| F17 | Shareable report link | Stable URL per VIN+timestamp snapshot |
| F18 | PDF export | Print-friendly report |

### 3.2 Phase 2
| # | Feature |
|---|---|
| F19 | Accounts + **My Garage** (saved VINs) |
| F20 | **Crowdsourced service vault**: upload receipts/photos keyed to VIN; odometer-photo verification; records visible on future reports of that VIN (moderated; uploader can't be identified publicly) |
| F21 | **VIN alerts**: watch a VIN → notify on new auction/listing/recall events |
| F22 | Remaining state-portal adapters (TX, AZ, CA, MD, NJ, IL, GA, MO, UT, VT, VA) |
| F23 | IIHS ratings (post-approval) |
| F24 | VIN barcode/QR camera scanner (mobile web) |
| F25 | SEO surfaces: per-model recall/complaint/TSB pages, state-guide pages ("how to check a title in Ohio"), glossary of all ~60 NMVTIS brands |
| F26 | Canadian recalls (Transport Canada) + basic Canadian VIN support |

### 3.3 Phase 3
| # | Feature |
|---|---|
| F27 | Optional **embedded NMVTIS report** (user-triggered, at-cost ~$1, via approved-provider API; never cached) |
| F28 | Paid auction-history API top-up for pre-archive VINs |
| F29 | Seller mode: "prove my car's history" page with owner-supplied evidence |
| F30 | Public read API for our own aggregated (non-NMVTIS) evidence |
| F31 | International: UK MOT (full odometer history via DVSA API), France Histovec guided flow |

## 4. User flows

### 4.1 Core: VIN → report
1. Land → single VIN field (+ example VIN, camera scan later).
2. Validate (check digit; suggest correction via vPIC SuggestedVIN).
3. Progressive report render: identity instantly (local decode), then sections stream in
   as adapters return (each section has loading/hit/miss/error states, per-source
   timeout ≤ ~8s, report never blocks on one source).
4. Guided steps rendered as checklist cards: NMVTIS free report, NICB check, OEM recall
   check, OEM service-history pull — each with deep link + "mark as done / attach result"
   (attachment feeds F20 later).
5. Share / export.

### 4.2 Empty/degraded states (first-class design work)
- Vehicle too old (pre-1995 decode confidence) → say so.
- No state-portal coverage for the VIN's state chain → show which states we *can* check
  and route the NMVTIS guided step higher.
- Zero listing history → "not listed online since ~2015 or private-party only."
- Source down (state portals will be, regularly) → "temporarily unavailable" per
  section, retry async, never a blank.

## 5. Report content spec — labels & language
- Accident panel title: **"Accident & damage signals"** — never "Accident history."
- Ownership: **"Estimated owners"** with basis line.
- Warranty/value: ranges, not point values.
- Every section footer: `Source: … · Coverage: … · Last checked: …`
- Global disclaimer (see LEGAL.md): not affiliated with CARFAX; no completeness
  guarantee; vehicle data only, no personal information.

## 6. Non-functional requirements
- **Performance**: identity section < 1s (local decode); full report target < 10s
  streaming; CWV targets per repo web rules (LCP <2.5s on report page).
- **SEO**: report pages indexable per-VIN? **No** — thin/duplicative + invites bulk
  scraping of us; index model-level and guide pages instead (F25). VIN reports
  noindex.
- **Anti-abuse**: per-IP rate limit on report generation (protects our upstream
  quotas), simple proof-of-work or turnstile if abused; our MarketCheck quota is the
  scarce resource — cached VINs are free to re-serve.
- **Accessibility**: WCAG 2.2 AA; charts have table equivalents.
- **Privacy**: no owner PII anywhere; uploads moderated; user accounts store email only.
- **Mobile-first**: buyers use this standing in a seller's driveway.

## 7. Success metrics
Reports generated/day · % sections with ≥1 hit per report · guided-step completion rate
(NMVTIS/NICB clicks) · archive growth (VINs with ≥1 stored evidence record) · Phase 2:
uploads per 100 reports · return visitors on alerts.

## 8. Known risks
| Risk | Mitigation |
|---|---|
| State portals / OEM endpoints break silently | Adapter health monitoring + per-section degraded states; treat all as best-effort (ARCHITECTURE §6) |
| MarketCheck free tier too small at growth | Aggressive VIN-level caching; own archive compounds; $0.006/call upgrade is cheap |
| Users read "signals" as "no accident = clean" | Wording + coverage panel + severity of disclosure reviewed in usability tests |
| Upstream ToS change (Carsforsale stops free NMVTIS) | Fallback: list all approved providers with prices; cheapest ~$3.49 |
| Legal pressure (aggregator-adjacent) | We scrape only tier-allowed sources (LEGAL.md); link-outs for everything contested |
