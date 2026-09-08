# Carrier List Templates preview browser evidence — 2026-09-08

## Narrative

This verification increment converts the existing simulated Carrier List Templates preview into a reproducible browser journey. It validates the operator-visible path from reusable CRM list to Carrier Fit to Message while keeping every external effect disabled.

## Result

- Runner: `npm run certify:carrier-list-templates:preview`
- Viewports: `1440x900`, `1024x768`, `390x844`
- Captures: 3 complete viewport journeys; each includes Library, Builder, Carrier Fit, and Message screenshots.
- Carrier Fit fixture: 9 template members partitioned as 4 eligible, 2 already in RFx, 1 missing contact, and 2 unavailable.
- CTA: `Add 4 carriers to this RFx and open Message`
- Accessibility/geometry: zero unnamed controls and zero horizontal overflow in all viewports.
- Runtime errors: zero console, page, and HTTP asset errors.
- External requests: zero; route guard aborted any non-local request.
- External effects: none. No API, persistence, draft, invitation, provider, or Delivery queue call was issued.

The JSON report and screenshots are generated under `tmp/carrier-list-templates-evidence/` and remain untracked by design. This evidence proves the local preview journey only; it does not certify remote tenant isolation or production readiness.
