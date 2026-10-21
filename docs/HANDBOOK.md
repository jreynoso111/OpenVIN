# HighView Handbook — Current State & Hands-On Guide

> The practical "pick up the project here" document. What is actually built and live,
> how it works, the invariants you must not break, and what to do next.
> Last updated: 2026-10-19. Strategy/research background lives in the other docs
> (see the map in [../README.md](../README.md)).

## 1. Snapshot

- **Live**: https://highview-chi.vercel.app/ (GitHub Pages, auto-deploys on
  every push to `master` via `.github/workflows/deploy.yml`: test → build → deploy).
- **Stack**: Vite + vanilla TypeScript (strict), **zero runtime dependencies**,
  PostgreSQL-free — fully static; all data is fetched in the visitor's browser.
- **Size**: ~22.6 kB gzipped JS + ~6.2 kB CSS (budget: 80 kB).
- **Tests**: 117 vitest unit tests (`npm test`). `npm run build` runs `tsc --noEmit` first.
- **Scope**: the static MVP ("HighView Lite") — see [STATIC_MVP.md](./STATIC_MVP.md) for
  what is deliberately excluded until a backend exists.

## 2. What the app does (as shipped)

One search box accepts a **VIN, plate (optional state), company or DBA name, USDOT
or MC number** (auto-detected, or forced with the Any/VIN/Plate/Company switch).
Every identifier on screen is a pivot link (`?vin=`, `?plate=&state=`, `?dot=`,
`?mc=`, `?name=`) that opens its own file, so an investigation can move
VIN → plate → other VINs → carrier → fleet without retyping.

| File | Contents |
|---|---|
| VIN | Decoded specs · **where it has been seen** (last roadside stop, states and sites by frequency, carrier base, fleet markings) · **connections** (plates carried and other VINs on those plates, carriers, trailers/chassis inspected together) · roadside log · carrier profiles · NY inspections when they exist |
| Plate | Every VIN recorded with the plate, carriers on those stops, where it was stopped, roadside log |
| Company / DBA | Business carriers whose legal or DBA name contains every word (individuals are never listed by name) |
| USDOT / MC | Census profile, the fleet seen on its 400 most recent inspections (filterable by VIN, plate, cab/unit number), operating states |

A right-hand rail lists every source checked with its status and query time, the
official follow-ups (NICB, NMVTIS, state title, auction), and one limits note. NHTSA
recalls, complaints and NCAP ratings are no longer shown: they describe the model
line, not the unit being located. Their data modules remain in `src/lib/api/`.

## 3. Codebase map

```
src/lib/            DATA LAYER (pure + fetchers; UI never parses raw API JSON)
  types.ts          THE CONTRACT: SectionResult<T>, statuses, all data shapes. No person fields, ever.
  vin.ts            normalize/squish + ISO 3779 check digit (see invariant #5)
  query.ts          search parsing (VIN / plate / USDOT / MC / name) and URL mapping
  api/http.ts       fetchJson: 12s timeout, retry×2 on 429/5xx/timeout/network,
                    per-host pacing for api.nhtsa.gov (see invariant #4); httpTuning test seam
  api/vpic.ts       decode (154 fields) — vpic.nhtsa.dot.gov, CORS *, reliable
  api/ny.ts         data.ny.gov Socrata vezn-fmmk — full-VIN odometer history (NY vehicles)
  api/fmcsaShared.ts dataset IDs, SoQL helpers, business-only carrier parsing, unit/inspection parsers
  api/fmcsa.ts      VIN → inspections, violations, coupled units, carrier census
  api/fmcsaLookup.ts plate search, carrier search by name/USDOT/MC, carrier fleet, plate second hop
  api/recalls.ts, complaints.ts, safety.ts, fueleconomy.ts, warranty.ts — kept, not called by the UI
  links.ts          guided link-outs: NMVTIS, NICB, state portals, auctions
  report.ts         startReport(vin) → VIN-file promises that always resolve
src/ui/             UI LAYER
  shell.ts          top bar with the search box, landing page, footer, recent searches (localStorage)
  searchForm.ts     mode switch + input + plate state
  case.ts, panel.ts case header, two-column layout, panels, sources ledger, rail blocks
  pivot.ts          identifier links (intercepted in main.ts for in-app navigation)
  report.ts         VIN file; commercial.ts = its FMCSA sections
  plateFile.ts, carrierFile.ts  plate, carrier and name-search files
  carrier.ts, sightings.ts      carrier profile and location/frequency/log building blocks
  identity.ts, odometer.ts, links.ts, viz.ts, dom.ts  shared renderers and helpers
src/styles/         tokens.css (ALL colors/type — both themes), base.css (shell/search), desk.css, viz.css
tests/              unit tests; API modules tested via exported mappers; search.test covers parsing,
                    census privacy filtering and fleet grouping
```

## 4. Invariants — do not break these

1. **`SectionResult` contract**: every data function resolves (never rejects) to
   `{status, data?, source, note?}`. UI degrades per-section; the report never blocks on
   one source.
2. **`isCurrent()` generation guard**: every hydration callback in `src/ui/report.ts`
   checks it. Prevents a superseded report (user re-searched mid-flight) from writing
   into the current view/title. Bumped in `main.ts` on every view change.
3. **No owner PII anywhere** — code, fixtures, uploads, issues. [LEGAL.md](./LEGAL.md)
   §1 prohibited list is binding: no scraping NICB/Copart/IAAI/Carsforsale/OEM portals
   (link-outs only), no NMVTIS caching.
4. **api.nhtsa.gov is burst-rate-limited** (intermittent 503s took most sections down in
   production once). All calls to it go through `fetchJson` → serialized with a 350 ms
   gap + retry×2 with backoff. Never add a parallel direct `fetch` to that host.
5. **Check digit is region-scoped**: enforced only for North-American-built VINs
   (first char 1–5). EU VINs use position 9 as ordinary data — strict enforcement
   wrongly rejected French/German VINs. (Also: the famous "sample" F-150 VIN
   1FTFW1ET5DFC10312 circulating online is genuinely check-digit-invalid.)
6. **Charts must be `viewBox`-sized**, not measured — hidden tab panels have zero
   measured width. Panels stay mounted so hydration is tab-independent.
7. **`[hidden]{display:none !important}`** lives in global.css — author `display:flex`
   on components was silently defeating the `hidden` attribute before this fix.
8. **Colors only via tokens.css custom properties.** Zero hardcoded colors in component
   CSS is what keeps both themes correct without per-theme audits.
9. Report content stays vehicle-data-only, estimates labeled as estimates, and source
   status remains visible in each section with the footer disclaimer. The standalone
   Coverage panel is not part of the current report.

## 5. Data-source quirks (operational notes)

| Source | Quirk |
|---|---|
| vPIC | Rock-solid, CORS `*`. Self-hostable Postgres dump exists for the backend phase. |
| api.nhtsa.gov | 503s on bursts (see invariant #4); also throttles per-IP after many rapid queries — sections degrade honestly and recover. Emits occasional malformed dates (e.g. `2019-27-06`) — such campaigns are omitted from timeline dots (list still shows them). **TODO: date normalizer in the data layer.** |
| data.ny.gov | CORS `*`, no token needed at this volume. NY-registered vehicles only — most VINs correctly show "No records". |
| fueleconomy.gov | Model names differ from vPIC ("Civic 4Dr") — matching is fuzzy (exact → contains); `matchQuality` reflects it. |
| OEM sticker/recall URLs | Ephemeral by nature; all are link-outs so breakage is graceful. Verified 2026-08. |
| Carsforsale free NMVTIS / NICB | Link-outs ONLY (ToS + Cloudflare). NICB: 5 lookups/IP/day. |

## 6. Developing

```bash
npm install
npm run dev        # local dev server
npm test           # 117 unit tests
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # serve dist at :4173 (path /HighView/)
git push           # → auto test + build + deploy to Pages
```

- Sample VIN for manual testing: `1HGCM82633A004352` (2003 Accord — 24 recalls,
  24 complaints sharing its 11-character VIN prefix; NCAP "Not rated" is correct for its era).
- **Adding a data source**: check LEGAL.md tier first → new module in `src/lib/api/`
  returning `SectionResult` via `fetchJson` → export a pure mapper and test it on a
  real-response fixture → wire into `src/lib/report.ts` → render it in the relevant
  detailed section with its source and status.
- **Adding a chart**: build in `src/ui/viz.ts` (SVG, tokens, viewBox, aria-hidden +
  text fallback), styles in `viz.css`.
- Conventional commits (`feat:`/`fix:`/`docs:`…); files < 400 lines; strict TS, no `any`
  outside the raw-JSON boundary; no `console.log`.

## 7. Known gaps & next steps

Near-term polish
- [ ] Data-layer date normalizer for malformed NHTSA dates (fixes timeline omissions + raw date display)
- [ ] PNG og-image (SVG og images are ignored by some platforms)
- [ ] Playwright E2E for the core flow (landing → report → tabs → expander) incl. degraded states
- [ ] True-320 px and light-theme visual regression pass (verified structurally; not pixel-audited)
- [ ] Consider persisting the active tab in the URL hash

Product roadmap (specced, needs a backend — see [TASKS.md](./TASKS.md) / [ARCHITECTURE.md](./ARCHITECTURE.md))
- Listing history + market value (MarketCheck/Auto.dev free tiers — API keys can't ship in a static site)
- Auction-appearance index (rebrowser datasets), FARS fatal-crash prefix matching
- Crowdsourced service-record vault, VIN alerts, accounts
- Embedded at-cost NMVTIS option; UK MOT / France Histovec international mode

## 8. History of notable incidents (why things are the way they are)

- **"Most sections Source unavailable" (2026-08-26)**: api.nhtsa.gov burst 503s + no
  retries. Fixed with pacing + retry (invariant #4). Verified live: 503 → retry → 200.
- **EU VINs rejected**: strict global check-digit enforcement. Fixed region-scoped
  (invariant #5).
- **Review-caught pre-launch**: stale-report race (fixed with generation guard),
  header stuck on "Decoding…" when decode fails (always-callback + fallback),
  `maxlength=17` truncating pasted VINs with separators (removed).
- **Chrome screenshot artifact during automation**: occluded-window compositor frames
  go stale — DOM checks are authoritative; fresh navigations capture correctly. Not a
  site bug; real users are unaffected.
