# OpenVIN

**Free, open-source vehicle history reports.** Enter a VIN, get the most complete
history report legally assemblable from open data — with every section labeled by
source and coverage, including what *no* report (free or paid) can see.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status: Planning](https://img.shields.io/badge/status-planning-blue.svg)](./docs/TASKS.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

> **Status: research & hand-off complete — implementation starting.** This repository
> currently contains a complete, citation-backed research and development package. If
> you want to help build it, start with [CONTRIBUTING.md](./CONTRIBUTING.md).

## Why

Paid vehicle history reports cost $25–$45 per VIN, yet most of what they contain comes
from public data: federal safety databases, state title and inspection records, and the
federally mandated NMVTIS title system. The rest comes from private relationships that
*no* competitor — free or paid — can replicate, and the incumbents bury that limitation
in fine print.

OpenVIN's bet is that **radical transparency beats false completeness**: assemble
everything that is legally free, link the user to the free official sources they must
query themselves (NMVTIS, NICB, manufacturer recall checkers), and disclose exactly what
was checked, what was found, and what nobody can see.

## What the free stack can and cannot do

| Verdict | Categories |
|---|---|
| ✅ Full parity, free | VIN decode & specs (NHTSA vPIC, 154 fields) · recalls · complaints/TSBs/investigations (a section the incumbents don't even show) · safety ratings · fuel economy · window stickers (GM, Stellantis, Ford, Hyundai) · warranty estimate · market range from visible comps · fatal-crash flag · theft/total-loss check (guided NICB) |
| 🟡 Near-parity | Federal title brands & total loss — free via an official NMVTIS provider link-out · odometer history — free in ~15 states (NY publishes full-VIN inspection data as bulk open data) · ownership estimate — inferred from listing history |
| 🔴 Structural gaps (for everyone) | Police-reported non-fatal accidents (open crash data deliberately strips VINs) and dealer service records (proprietary, contractually locked). OpenVIN handles both with a labeled proxy-signal stack and crowdsourced owner uploads — never by pretending |

## Documentation

| Doc | Purpose |
|---|---|
| [docs/RESEARCH_REPORT.md](./docs/RESEARCH_REPORT.md) | **The master reference** — every data source with live-tested endpoints, limits, pricing, and state-by-state tables |
| [docs/PLAN.md](./docs/PLAN.md) | Sourcing strategy: each report section → its free source |
| [docs/CARFAX_SUPPLY_CHAIN.md](./docs/CARFAX_SUPPLY_CHAIN.md) | How the incumbent actually acquires its data (verified, with confidence levels) |
| [docs/PRD.md](./docs/PRD.md) | Product spec: 31 features across 3 phases, report blueprint, user flows |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design: local mirrors, on-demand adapters, evidence store, streaming report assembly |
| [docs/LEGAL.md](./docs/LEGAL.md) | **Binding guardrails** — the prohibited list, source tiers, DPPA/NMVTIS rules. Read before writing any fetcher |
| [docs/TASKS.md](./docs/TASKS.md) | Phased implementation backlog with acceptance criteria |

## Roadmap

1. **Phase 1 — Parity core**: self-hosted VIN decode, NHTSA mirrors, NY open-data
   mirror, first state adapters, auction index, listing history, streaming report page
   with the coverage-disclosure panel.
2. **Phase 2 — Depth**: remaining state adapters, accounts & garage, crowdsourced
   service-record vault, VIN alerts, SEO surfaces.
3. **Phase 3 — Extensions**: optional at-cost NMVTIS embed, seller mode, public API,
   international (UK MOT, France Histovec).

Full backlog: [docs/TASKS.md](./docs/TASKS.md).

## Contributing

Contributions are welcome **now**, before any code exists — the highest-value help is
verifying data sources (government endpoints and state portals rot constantly), adding
missing state lookup tools, and correcting research with citations. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

Hard rule for all contributions: [docs/LEGAL.md](./docs/LEGAL.md) is binding. PRs that
add scrapers for prohibited sources (NICB, Copart/IAAI, NMVTIS provider sites) or that
introduce owner personal information will be declined regardless of technical quality.

## Legal

OpenVIN is an independent open-source project. It is **not affiliated with, endorsed
by, or connected to CARFAX, Inc.**, Experian (AutoCheck), or any data provider named in
the documentation; trademarks belong to their owners and are referenced only for
identification and comparison. No vehicle history source — free or paid — is complete:
events never reported to any public system will not appear here or anywhere else.
Reports will contain vehicle data only, never personal information about owners.

## License

[MIT](./LICENSE)
