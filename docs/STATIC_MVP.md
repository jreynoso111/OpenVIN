# Static MVP ("VinOrbits Lite") — Scope & Rationale

The first shipped version is a **fully static site on GitHub Pages** — no backend, no
database. This document records what that constraint changes relative to
[ARCHITECTURE.md](./ARCHITECTURE.md) (which remains the target for the full product).

## What works client-side (in the MVP)

All fetches happen in the visitor's browser against CORS-enabled public APIs:

| Section | Source | Mode |
|---|---|---|
| VIN decode / identity | NHTSA vPIC `DecodeVinValues` | live fetch |
| Recalls (campaigns) | NHTSA `recallsByVehicle` (build-window caveat noted) | live fetch |
| Complaints (squish-VIN matched) | NHTSA `complaintsByVehicle`, filtered client-side on the 11-char VIN prefix | live fetch |
| Safety ratings | NHTSA SafetyRatings (two-step) | live fetch |
| Odometer history (NY vehicles) | data.ny.gov Socrata `vezn-fmmk` by VIN | live fetch |
| Fuel economy | fueleconomy.gov REST (best-effort; degrades if CORS blocked) | live fetch |
| Warranty estimate | computed locally from a shipped factory-terms table | pure client |
| Rollback check | computed locally over collected readings | pure client |
| NMVTIS, NICB, state portals, OEM recall status, window stickers, auction records, service history | **guided link-outs** (per docs/LEGAL.md tiers) | user-initiated |

## What the static constraint excludes (deferred to the backend phase)

- Local mirrors (ODI flat files, FARS prefix index, NY bulk mirror, auction datasets) —
  no server to host them; FARS/auction sections are absent from the MVP.
- Keyed APIs (MarketCheck listing history, Auto.dev comps) — API keys cannot ship in a
  static site; listing history and market range are absent from the MVP.
- State-portal adapters (HTML fetches, no CORS) — all demoted to link-outs.
- The evidence archive, crowdsourced vault, alerts, accounts.

## Consequences

- The MVP is still per-VIN useful and 100% free to operate (visitor's browser pays the
  bandwidth; no quotas of ours are consumed).
- Every browser fetch degrades gracefully to an `unavailable` state — the report renders
  regardless of any single API's health.
- The coverage panel discloses the MVP's narrower scope honestly, exactly as the full
  product would.
- When the backend phase starts (docs/TASKS.md), the static app becomes the frontend and
  its `src/lib` fetchers are progressively replaced by API calls to our own service.
