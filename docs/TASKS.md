# Implementation Backlog — OpenVIN

Ordered, dependency-aware. Each task lists acceptance criteria (AC). Follow repo rules:
TDD on pure logic, adapter contract tests on fixtures, files <400 lines, no PII fields
in any migration (LEGAL.md is a blocker review on every data-touching PR).

## Phase 0 — Foundations (½–1 week equivalent)

- [ ] **T0.1 Repo scaffold**: app framework + TypeScript + Postgres + migrations + CI
  (lint, typecheck, tests). AC: `pnpm build` green in CI.
- [ ] **T0.2 VIN utilities**: check-digit validation, squish-VIN (first 11), 12-char
  prefix, model-year decode helper. AC: unit tests incl. known-bad VINs, transliteration
  edge cases (I/O/Q), pre-1981 rejection with friendly error.
- [ ] **T0.3 Evidence store schema**: tables per ARCHITECTURE §4 + provenance columns +
  `api_quota` + `adapter_health`. AC: migration reviewed against LEGAL §1 (no person
  fields); insert/query round-trip tests.
- [ ] **T0.4 Adapter framework**: uniform interface, timeout, circuit breaker, cache
  layer, quota guard, health recording, fixture-based contract-test harness. AC: a fake
  adapter demonstrates open/half-open breaker + quota exhaustion path in tests.

## Phase 1 — Mirrors (parallelizable)

- [ ] **T1.1 vPIC self-hosted decode**: monthly ingestion of the Postgres dump + decode
  function + API fallback. AC: 20 known VINs decode identically to live vPIC; decode
  <100 ms local.
- [ ] **T1.2 ODI nightly mirror**: complaints/recalls/TSBs/investigations download, diff,
  load; squish-VIN index; recall build-window (BGMAN/ENDMAN) filter. AC: complaint with
  known truncated VIN retrievable by squish match; nightly job idempotent.
- [ ] **T1.3 FARS prefix index**: load Vehicle files 1975→, 12-char prefix index. AC:
  documented FARS case VIN prefix returns a match; non-matches fast.
- [ ] **T1.4 EPA + NCAP**: vehicles.csv load + decode→vehicle-id fuzzy mapper; NCAP
  fetch-and-cache per Y/M/M. AC: mapper resolves ≥90% of a 100-VIN test set to a unique
  EPA id; ambiguous → top-2 candidates flagged.
- [ ] **T1.5 NY Socrata mirror**: `vezn-fmmk` + `w4pv-hbkt` weekly bulk (app token). AC:
  known NY VIN returns odometer series; refresh idempotent.
- [ ] **T1.6 Auction index**: daily rebrowser copart/iaai dataset ingestion →
  auction_events by VIN. AC: sample VIN from dataset yields damage/title/mileage event;
  dedupe across daily pulls.

## Phase 2 — Adapters

- [ ] **T2.1 State title adapters**: OH (first — simple CGI), NY, MA, CO. AC: fixture
  contract tests; schema-drift detection (expected-field validation); breaker verified
  by killing a fixture server.
- [ ] **T2.2 Emissions adapters wave 1**: AZ, CO (plain CGI). Wave 2: TX, NJ, IL, MD.
  Wave 3: CA, GA, MO, UT, VT, VA, WI. AC each: odometer readings land as evidence with
  provenance; politeness cap enforced (test asserts ≤1 req/s/portal).
- [ ] **T2.3 MarketCheck VIN-history adapter**: permanent caching, quota guard (500/mo),
  listing_events + photos hotlinked per API terms. AC: quota exhaustion renders cached/
  degraded section, never an uncounted call.
- [ ] **T2.4 Auto.dev comps adapter**: comps by Y/M/M/trim/region, 7-day cache. AC:
  returns ≥20 comps for a common vehicle; regional fallback widening tested.
- [ ] **T2.5 OEM sticker adapters**: GM, Stellantis (+ Ford/Hyundai if stable), PDF
  archived to object storage, fetch-once-ever. AC: second request serves archive; dead
  endpoint degrades to "recreated sticker."

## Phase 3 — Derivations (pure functions, TDD)

- [ ] **T3.1 Odometer timeline + rollback detector**: merge all reading kinds, flag
  non-monotonic (with unit-mix and typo tolerance, e.g., ±1 reading dismissible). AC:
  test suite covers rollback, km/mi confusion, single-outlier, exempt vehicles.
- [ ] **T3.2 Ownership-episode inference**: listing episodes + state jumps + NY
  registration → estimate with basis. AC: fixture scenarios (1-owner, 3-owner
  cross-state, dealer-flip chains) produce documented expected outputs.
- [ ] **T3.3 Warranty estimator**: brand/year factory-terms table (data file) + in-service
  heuristic + mileage. AC: table covers top 20 brands; outputs ranges; Hyundai/Kia
  transfer rules handled.
- [ ] **T3.4 Market range**: mileage-depreciation regression over comps, median + IQR +
  history adjustments. AC: deterministic on fixture comps; degrades to "insufficient
  comps" below threshold.
- [ ] **T3.5 Accident-signal aggregator**: 6 detectors → panel model with per-signal
  provenance. AC: each detector independently testable; "no signals ≠ no accidents"
  language enforced in the model, not just UI copy.

## Phase 4 — Product surface

- [ ] **T4.1 Report page**: streaming sections, hit/miss/unavailable/guided states,
  mobile-first, odometer chart with table fallback. AC: full report ≤10s on warm
  mirrors with 2 adapters artificially slow; Playwright E2E incl. degraded states;
  visual regression at 320/768/1024/1440; WCAG 2.2 AA checks.
- [ ] **T4.2 Guided-step cards**: NMVTIS (Carsforsale), NICB, OEM recall, OEM service —
  deep links + instructions + "mark done." AC: links resolve; per-brand routing from
  decode.
- [ ] **T4.3 Coverage panel**: sources queried/hit/miss/can't-see + global disclaimer
  (LEGAL §4). AC: content review against LEGAL.md.
- [ ] **T4.4 Share links + PDF export**: snapshot model, stable URLs, noindex on VIN
  pages. AC: snapshot immutable; "new data since generation" flag on revisit.
- [ ] **T4.5 Anti-abuse**: per-IP report-generation limits protecting upstream quotas.
  AC: load test confirms metered adapters can't be drained by one client.
- [ ] **T4.6 Ops**: adapter health dashboard + canary VINs + alerting. AC: killing an
  adapter fires an alert and flips its section to degraded within one canary cycle.

## Phase 5 — Growth (post-launch)

- [ ] T5.1 Accounts + garage · T5.2 Crowdsourced vault (moderation queue, EXIF strip,
  receipt-PII redaction, DMCA flow — LEGAL §5 blockers first) · T5.3 VIN alerts (diff
  on new evidence) · T5.4 SEO surfaces (model pages from ODI mirrors, state guides,
  brand glossary) · T5.5 IIHS post-approval · T5.6 Transport Canada + Canadian VINs ·
  T5.7 Embedded NMVTIS add-on (per-request, discard — LEGAL §1) · T5.8 UK MOT /
  Histovec international mode.

## Standing review gates
Every PR touching data: LEGAL.md checklist. Quarterly: re-verify Tier-2 portals' ToS,
Carsforsale free-NMVTIS availability, OEM sticker endpoints (canaries cover drift
day-to-day). Before launch: counsel review of LEGAL §4 texts; DMCA agent registration
(if F20 ships); load-test upstream quota guards.
