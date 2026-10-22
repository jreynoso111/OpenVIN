# Contributing to VinOrbits

Thanks for your interest! VinOrbits is at the **planning/early-implementation stage**, and
contributions are valuable right now — you don't need to wait for code to land.

## Ground rules (read first)

1. **[docs/LEGAL.md](./docs/LEGAL.md) is binding.** In particular:
   - No scrapers for prohibited sources (NICB VINCheck, copart.com, iaai.com, NMVTIS
     provider sites, OEM owner portals). Such PRs will be declined regardless of quality.
   - No caching or storing of NMVTIS data.
   - No owner personal information anywhere — not in code, schemas, fixtures, or issues.
   - New data sources must fit the source-tier model (LEGAL.md §2).
2. Be respectful — see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
3. Research claims need citations. "I heard that…" doesn't merge; a URL does.

## High-value contributions today

- **Source verification**: the research docs list dozens of live endpoints (government
  APIs, state portals, OEM window-sticker URLs). These rot constantly. Re-test one and
  file a report — working or broken, both are useful. Use the *Broken/changed data
  source* issue template.
- **New sources**: know a state title/inspection lookup, open dataset, or free API we
  missed? Use the *Data source proposal* template. State-level coverage is where the
  most ground can be gained (see the state tables in
  [docs/RESEARCH_REPORT.md](./docs/RESEARCH_REPORT.md)).
- **Research corrections**: anything in `docs/` that is wrong, outdated, or imprecise —
  PR it with a citation.
- **Legal review**: if you have relevant expertise (DPPA, scraping law, EU/GDPR),
  critique [docs/LEGAL.md](./docs/LEGAL.md).
- **Design**: report-page UX proposals, especially for the coverage-disclosure panel
  and degraded/empty states ([docs/PRD.md](./docs/PRD.md) §4.2).

## Contributing code (as implementation starts)

- Pick a task from [docs/TASKS.md](./docs/TASKS.md) — they're ordered and carry
  acceptance criteria. Comment on / open an issue to claim it.
- Follow [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): adapters implement the uniform
  interface (timeout, circuit breaker, cache policy, quota guard) and ship with
  fixture-based contract tests.
- Pure derivation logic (rollback detection, ownership inference, estimators) is
  test-first: write the failing test, then the code.
- Keep files small and focused; prefer many small modules.

## Workflow

1. Fork → branch (`feat/…`, `fix/…`, `docs/…`).
2. Commits use Conventional Commits: `<type>: <description>` where type ∈
   `feat, fix, refactor, docs, test, chore, perf, ci`.
3. Open a PR using the template. Data-touching PRs must tick the LEGAL.md checklist.
4. CI (lint, typecheck, tests) must be green.

## Licensing of contributions

By contributing, you agree your contributions are licensed under the project's
[MIT License](./LICENSE) (inbound = outbound). No CLA.

## Questions

Open an issue, or contact the maintainer: [@FrancoisChastel](https://github.com/FrancoisChastel).
