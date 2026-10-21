# Legal Guardrails — HighView

These are design constraints, not advice; before public launch, have a lawyer review
this checklist, the site ToS, and the disclaimer text. Everything below is enforced in
code/architecture, not just policy.

## 1. The absolute prohibited list (never, regardless of feature pressure)

| Prohibited | Why |
|---|---|
| Server-side scraping of **NICB VINCheck** | Cloudflare circumvention + per-lookup ToS assent + 5/IP/day cap = worst legal posture (contract breach with a sympathetic nonprofit plaintiff; weakened CFAA defense when evading technical measures) |
| Scraping **copart.com / iaai.com** | Explicit anti-scraping ToS ("spider, crawl, scrape… including auction results"), robots disallow, member-gated data. Copart sells a formal Image & Data License — the only legit route |
| Scraping **Carsforsale.com** (or any NMVTIS provider's consumer site) | Provider ToS; Cloudflare. Free NMVTIS = link-out only |
| **Caching / storing / reselling NMVTIS data** | 28 CFR Part 25 + AAMVA provider contracts: no derivative databases, no re-serving one report to N users. Phase-3 embedded reports: fetch per-request, render, discard |
| Rehosting **auction photos** | Copyrighted; active DMCA/takedown industry around Copart/IAAI imagery. Link, never mirror |
| Storing/displaying **any owner PII** | DPPA (18 U.S.C. §2721): names, addresses, phone, DL#, SSN, photos from motor-vehicle records; $2,500 min statutory damages per violation. Schema contains no person fields except our users' emails |
| Automating **OEM owner portals** (service history) or OEM recall VIN checkers | Portal ToS + implicit ownership assertion. Guided self-check links only |
| Evasion techniques anywhere (IP rotation to beat caps, CAPTCHA solving, header spoofing beyond a honest UA) | Converts every gray area into a bad-faith fact pattern (hiQ endgame: contract claim → injunction + data deletion + $500k) |

## 2. Allowed-source tiers

- **Tier 0 — unrestricted**: US federal data (public domain, 17 U.S.C. §105): vPIC, NHTSA
  APIs + ODI files, FARS, EPA. State open-data portals with open licenses (NY Socrata).
- **Tier 1 — licensed/contracted**: MarketCheck, Auto.dev, Transport Canada (key),
  IIHS (post-approval, respect display terms), CarAPI. Follow each contract; keep keys in
  env; track quotas in `api_quota`.
- **Tier 2 — public state portals without ToS-assent walls** (OH title CGI, AZ/CO
  emissions CGI, TX/NJ/IL/MD/etc. VIR forms): permitted with politeness caps (low rate,
  honest User-Agent identifying the service + contact email, per-VIN caching 30–90 days,
  immediate demotion to link-out if the state objects or adds bot protection). A state's
  objection email = stop within 24h.
- **Tier 3 — link-out only**: NICB, Carsforsale NMVTIS, FL MVCheck, OEM portals,
  auction-history aggregator pages, iSeeCars.
- **GitHub datasets** (rebrowser copart/iaai): consuming a published dataset ≠ scraping;
  risk sits upstream. Keep provenance; be ready to drop if taken down; facts (damage
  code, price, mileage) are not copyrightable.

## 3. Regulatory positioning

- **DPPA**: we handle vehicle-history facts, not motor-vehicle-record personal info —
  the same line NMVTIS/Carfax walk. Never join VIN evidence to an identifiable person.
- **FCRA**: vehicle history reports are about vehicles, not consumers → not "consumer
  reports." Keep it that way: no data about owners as people, no marketing suggesting
  use for employment/credit/insurance eligibility decisions about a person.
- **State UDAP / FTC Act**: the honesty features are also compliance features — no
  "guaranteed clean," no implication of completeness, clear labeling of estimates.
- **Trademark**: **never use "Carfax" in the product name, domain, logo, or ad
  keywords-as-branding**. Comparative references in prose ("a free alternative to paid
  reports such as CARFAX®") are acceptable nominative use; add ® on first mention and a
  non-affiliation note. Same for AutoCheck, Copart, IAAI, NICB.
- **The one-year lookback**: Carfax's Buyback Guarantee is their differentiator — we
  offer no guarantee; never imply one.

## 4. Required site text (draft for counsel review)

- **Global disclaimer (report footer)**: "This report aggregates publicly available and
  licensed vehicle data. It is not a CARFAX® report and is not affiliated with CARFAX,
  Inc. No vehicle history source — free or paid — is complete: accidents, damage, and
  service events that were never reported to any public system will not appear here or
  anywhere else. Ownership counts, warranty status, and market values are estimates.
  Always inspect a used vehicle independently before purchase."
- **Per-section source lines** (PRD §5) double as transparency compliance.
- **Site ToS**: no bulk/automated querying of our service; report content for personal,
  non-commercial use; uploads: user affirms right to share, grants display license,
  no third-party PII in uploads.
- **Privacy policy**: we store queried VINs and evidence (vehicle data), user email if
  registered, upload files; no sale of personal data; GDPR-lite posture (the founder is
  EU-based — honor deletion requests for accounts/uploads; VINs themselves are vehicle
  data, but delete upload provenance on request).

## 5. Upload (crowdsourced vault) rules

- Moderate before public display; strip EXIF GPS from photos server-side.
- Reject uploads containing visible third-party PII (plates okay — vehicle data — but
  redact names/addresses on receipts automatically or by reviewer).
- Uploader identity never shown publicly; internal provenance retained.
- DMCA agent registered before launch of F20; takedown flow documented.

## 6. Incident playbook

1. Objection/C&D from a Tier-2 state or any source → disable adapter (feature-flag)
   within 24h, demote to link-out, reply, log.
2. Upstream ToS change → adapters re-reviewed quarterly (calendar task); Carsforsale
   free-NMVTIS availability checked monthly (fallback: provider price list, VINData
   $3.49 cheapest retail).
3. Any request implying our data caused a bad purchase → point to disclaimer; never
   assert a vehicle is "clean," only that sources returned no records.
