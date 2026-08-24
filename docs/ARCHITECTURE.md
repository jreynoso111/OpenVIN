# Architecture — OpenVIN

Design goals: report streams in seconds · every upstream is unreliable by assumption ·
the local evidence archive compounds forever · legal constraints are enforced in code,
not policy docs.

## 1. System overview

```
                    ┌─────────────────────────────────────────────┐
                    │                  Web app                    │
                    │  VIN input → streaming report (SSE/suspense)│
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │            Report Assembly API              │
                    │  per-VIN fan-out · per-adapter timeout ·    │
                    │  circuit breakers · section-level results   │
                    └───────┬──────────────────────┬──────────────┘
                            │                      │
              ┌─────────────▼───────┐   ┌──────────▼─────────────┐
              │   Local mirrors     │   │  On-demand adapters    │
              │ (Postgres, nightly/ │   │ (live fetch, cached)   │
              │  weekly ingestion)  │   │                        │
              └─────────────────────┘   └────────────────────────┘
                            │                      │
              ┌─────────────▼──────────────────────▼──────────────┐
              │        Evidence store (append-only, by VIN)       │
              └───────────────────────────────────────────────────┘
```

Three data planes:
1. **Local mirrors** — bulk datasets ingested on schedule, queried locally at report
   time (fast, free, unlimited).
2. **On-demand adapters** — per-VIN live fetches with caching (state portals, commercial
   API free tiers, OEM stickers).
3. **Guided steps** — zero server calls; deep links the user follows (NICB, Carsforsale
   NMVTIS, OEM recall/service portals). Rendered as data-less report cards.

## 2. Local mirrors (ingestion workers)

| Mirror | Source | Cadence | Size | Query at report time |
|---|---|---|---|---|
| vpic | vPIC PostgreSQL dump (vpic.nhtsa.dot.gov/Downloads) | monthly | ~70 MB | decode by VIN (stored procs) |
| odi_complaints | static.nhtsa.gov/odi/ffdd/cmpl | nightly diff | 370 MB | squish-VIN (first 11) match; crash/fire flags |
| odi_recalls | …/odi/ffdd/rcl | nightly | ~25 MB | make/model/year + BGMAN/ENDMAN window filter |
| odi_tsbs, odi_inv | …/odi/ffdd/{tsbs,inv} | nightly | ~85 MB | make/model/year |
| fars_vins | static.nhtsa.gov FARS Vehicle files 1975→ | annual | moderate | 12-char VIN prefix index |
| epa | fueleconomy.gov vehicles.csv | monthly | small | matched via decode→(year,make,model,engine,trans) fuzzy map |
| ncap | api.nhtsa.gov/SafetyRatings crawl of relevant Y/M/M | weekly refresh of seen models | small | Y/M/M variant |
| ny_inspections | data.ny.gov `vezn-fmmk` bulk (Socrata app token) | weekly | large | by VIN: odometer + results |
| ny_registrations | data.ny.gov `w4pv-hbkt` bulk | weekly | large | by VIN |
| auction_index | github rebrowser/copart-dataset + iaai-dataset | daily | grows | by VIN: damage/title/mileage/sale events |
| specs | CarAPI free dataset + GitHub make/model lists | one-time + occasional | small | trim features |

Ingestion workers are idempotent, diff-based where possible, and write provenance
(source, fetched_at, source_version) on every row.

## 3. On-demand adapters

Uniform interface: `fetch(vin, context) → EvidenceRecord[] | Miss | Unavailable`, each
with: timeout (default 8s), retry policy (none at report time; async retry queue),
circuit breaker (open after N failures, half-open probe), cache policy, politeness cap.

| Adapter | Target | Cache TTL | Notes |
|---|---|---|---|
| state_oh_title | OH BMV gettitlesbyvin | 30 d | simple GET |
| state_ny_title | NY title/lien form | 30 d | needs VIN+year+make (from decode) |
| state_ma_title, state_co_title | forms | 30 d | MA needs last-8 |
| emis_az, emis_co, emis_tx, emis_ca, emis_md, emis_nj, emis_il, emis_ga, emis_mo, emis_ut, emis_vt, emis_va, emis_wi | state VIR portals | 90 d | phase-staged; AZ/CO first (plain CGI) |
| marketcheck_history | VIN History API | permanent (own archive) | THE quota to protect: 500/mo free |
| autodev_comps | listings search | 7 d (comps by Y/M/M/region, not per-VIN) | 1,000/mo free |
| oem_sticker_gm / _stellantis / _ford / _hyundai | window-sticker endpoints | permanent (archive PDF) | fetch once ever per VIN |
| tc_recalls | Transport Canada VRDB | 7 d | key in env |

**Adapter selection per VIN**: decode → known state chain (from listings/NY/auction
evidence) → only query portals for states in the chain + national ones. Don't blast all
50 adapters per report.

## 4. Evidence store (the compounding asset)

Append-only `evidence_records` keyed by VIN; report assembly is a pure function of a
VIN's evidence set + live adapter results.

```
vehicles(vin PK, squish_vin, decode jsonb, decoded_at)
evidence_records(id, vin FK, kind, observed_at date, source, source_ref,
                 payload jsonb, fetched_at, expires_at NULL)
  kind ∈ {odometer_reading, title_event, lien_event, inspection, auction_event,
          listing_event, complaint_match, recall_campaign, fars_prefix_match,
          sticker_pdf, user_upload, guided_step_result}
odometer_readings(vin, observed_at, miles, source, evidence_id)  -- materialized view
report_snapshots(id, vin, generated_at, sections jsonb)          -- for share links
uploads(id, vin, user_id, type, file_ref, odometer_claim, status moderation)
users(id, email, created_at)                                      -- nothing else
watches(user_id, vin) / notifications(...)
adapter_health(adapter, state, opened_at, failure_count, last_ok)
api_quota(provider, period, used, limit)                          -- hard budget guard
```

**Legal enforcement in schema**: no table may contain person-identifying fields except
`users.email`. NMVTIS data never enters the store (link-out only; Phase 3 embedded
reports are fetched per-request, rendered, and discarded — `expires_at = now()`).

## 5. Report assembly

1. Resolve VIN → decode locally (<50 ms) → emit identity section immediately.
2. Fan out: all local-mirror queries (parallel, ~ms) + selected adapters (parallel,
   8s cap each) + quota check before any metered call.
3. Each section resolves independently → streamed to client (SSE or RSC streaming);
   section states: `hit | miss | unavailable | guided`.
4. Cross-section derivations run when inputs settle: odometer monotonicity check,
   ownership-episode inference, warranty estimate, market range.
5. Persist snapshot → shareable URL. Failed adapters enqueue async retry; snapshot
   updates flagged "new data since generation" on revisit.

## 6. Resilience rules (upstreams WILL break)

- Per-adapter circuit breaker + health dashboard; a broken adapter degrades one section,
  never the report.
- Canary VINs: scheduled synthetic checks per adapter; alert on schema drift (HTML
  scrapes validated against expected field set, not positions).
- OEM sticker endpoints: archive-on-first-fetch; when an endpoint dies, archived VINs
  keep their stickers.
- Egress: some targets 403 datacenter IPs (crashviewer; FL MVCheck) — those are
  link-outs, not adapters. If a fetch-tier source starts blocking, demote to link-out;
  never escalate to evasion (LEGAL.md).
- Quota guard: `api_quota` checked transactionally before metered calls; on exhaustion,
  section renders "fresh data next month / cached view shown" rather than silent miss.

## 7. Tech stack recommendation (final call = implementer's)

- **Frontend/app**: Next.js (App Router, RSC streaming fits section-streaming) or
  SvelteKit; TypeScript; report page mobile-first; charts in lightweight SVG (no heavy
  chart lib for one timeline).
- **API/workers**: same Node/TS monorepo; ingestion as scheduled jobs (cron/queue —
  e.g., BullMQ/pg-boss on Postgres; avoid extra infra).
- **DB**: PostgreSQL (vPIC dump is natively Postgres — one engine for everything);
  jsonb payloads + typed materialized views.
- **Storage**: S3-compatible bucket for sticker PDFs + uploads.
- **Hosting**: anything with persistent Postgres + workers (Fly.io/Railway/Hetzner VPS);
  static/edge-only platforms fight the worker + big-DB model.
- **Testing** (per repo rules): unit on derivations (rollback check, episode inference,
  warranty calc — pure functions, TDD-friendly); adapter contract tests against recorded
  fixtures; Playwright E2E on the report flow incl. degraded states; visual regression
  at 320/768/1024/1440.

## 8. Directory sketch (for the implementing session)

```
src/
├── app/                    # routes: /, /vin/[vin], /guides/*, /models/*
├── components/report/      # one folder per section (identity/, odometer/, …)
├── adapters/               # one file per adapter, uniform interface + fixtures/
├── mirrors/                # ingestion jobs, one per mirror + schemas
├── derive/                 # pure functions: rollback, ownership, warranty, value
├── lib/                    # vin utils (check digit, squish), quota, breaker
└── db/                     # migrations, views
docs/                       # this hand-off
```

Keep files <400 lines; adapters and sections are naturally small modules.
