# Vektor TMS integration discovery

Checked 2026-10-19. This is a source and architecture note; HighView does not
currently call Vektor or store Vektor records.

## Free FMCSA data now connected to High View

High View now queries the public FMCSA datasets directly from the browser, without
an API key or a Vektor subscription. `src/lib/api/fmcsa.ts` joins Inspections Per
Unit to the Vehicle Inspection File by `inspection_id`, then joins violation
descriptions by both `inspection_id` and the exact `insp_unit_id` matched to the
VIN. It reads carrier company and DBA names for identified business entities, plus
status, operation class, reported truck/power-unit counts, the crash-rate field,
MCS-150 date, authority docket/status, and safety rating/date. Individual names,
contacts, addresses, officers, drivers, and other person records are omitted.

The report shows historical inspection date, state and site, observed plate, USDOT
carrier company name and ID, vehicle-level violation counts, unit-linked violation
descriptions, out-of-service results, and inspection IDs. A plate-observation summary groups the
VIN-matched plate/state pairs by latest sighting and count. An official SAFER Company
Snapshot link opens the USDOT record externally. A carrier listed on an old
inspection is not proof of the current operator or owner. An inspection site is not a
live vehicle location. FMCSA says its inspection files are updated daily from a
24-hour-old database and include three years of history; older reports may be
missing even when another service retained them.

The FMCSA connection covers the public commercial-roadside portion of the data
Vektor exposes, but it is not a replacement for Vektor TMS dispatch or tracking.
Vektor remains unconnected; a private TMS feed still requires an authorized
account/API key and its own integration approval.

## What the public documentation describes

Vektor publishes a separate **Carrier Intelligence API** for FMCSA/NHTSA-derived
carrier and commercial-unit data. Its `GET /api/v1/units/{vin}` endpoint is described
as decoded vehicle identity plus cross-carrier inspection and plate history. The
carrier-record endpoint includes state-coded roadside inspections, observed VIN/plate
units, out-of-service orders, authority, and insurance sections. The API documentation
labels each section with a source and `as_of` date. This is commercial-fleet evidence,
not a live vehicle-location feed or a private registration lookup.

Every API request requires a key issued by Vektor. Per-key rate and monthly quotas are
set when the key is issued. The documented response cache is private to the client and
lasts up to one hour; data is described as refreshed daily. The carrier export job is
for batches of up to 500 USDOT numbers, can return CSV or JSON Lines, and its signed
download URL expires five minutes after job completion. It is not a general VIN-list
snapshot endpoint.

Vektor's TMS integration pages describe load feeds, tracking/status, bills of lading,
proofs of delivery, and partner integrations. They do not describe these as vehicle
title, lien, theft, or owner-registration records.

## HighView integration constraints

- The current app is a static Vite client. Never put a Vektor API key in browser code,
  a `VITE_*` variable, GitHub Pages, or a public Vercel bundle.
- If access is approved, call the VIN endpoint through an Ubuntu-hosted backend
  service, keep the key in Ubuntu's protected service environment, and return only an
  allowlisted vehicle-data shape to the browser.
- Exclude carrier contact details and all driver/person fields. Do not collect GPS
  positions or present inspection states as a current location.
- Do not persist raw API snapshots until Vektor confirms the applicable terms for
  storage, report display, and retention. Preserve source and `as_of` on any displayed
  section.
- The published OpenAPI document lists an HTTP deployment URL and describes HTTPS as
  canonical once its reverse proxy is live. Confirm the supported HTTPS API base with
  Vektor before sending an API key.
- The API does not replace state title or lien portals, NMVTIS, NICB, or other
  VIN-specific official checks already represented in HighView.

## Automation path to confirm

1. Confirm the account has access to the Carrier Intelligence API and the VIN unit
   endpoint, plus the approved HTTPS base URL and written usage/retention terms.
2. Request an API key directly through Vektor's authorized account channel. Keep it
   out of chat, source control, and browser storage.
3. Add an on-demand VIN adapter on Ubuntu. Add scheduled carrier exports only if the
   use case is a USDOT watchlist and the account terms allow that cadence; download
   completed exports within the documented five-minute window.
4. Show matching inspection/plate observations with their state, date, source, and
   confidence limits. Do not imply ownership, a lien, theft status, or real-time
   location from those observations.

## Sources

- [Vektor Carrier Intelligence API](https://vektortms.com/directory/developers)
- [Vektor OpenAPI document](https://vektortms.com/api/v1/openapi.json)
- [Vektor TMS integrations](https://vektortms.com/integrations)
- [Vektor API Connect](https://vektortms.com/brokers/api-connect)
