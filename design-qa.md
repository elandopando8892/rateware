# P3-V3 Procurement and Carrier Network design QA

Date: 2026-08-25
Candidate branch: `codex/p3v3-procurement`
Candidate base: `f329b3c580ba9a7c3bf9f7836d2af4986f946f3f`
Scope: `vendors.html`, `rfx-process.html`, `rfx-events.html`, `ratebook.html`, `outreach.html`

## Visual target

- Primary reference: `docs/platform55-visual-parity/wireframes/p3v3/platform55-build05-procurement-wireframe-1920x1080.png`
- Carrier identity reference: `docs/platform55-visual-parity/wireframes/p3v3/platform55-service-360-reference-1920x1080.png`
- Responsive comparison target: the supplied Build 05 Procurement and Carrier Network composition, adapted to the existing Rateware content and controllers.
- No new navigation system, palette, typography, iconography, or visual metaphor was introduced.

## Implementation evidence

Working captures live under `docs/platform55-visual-parity/evidence/p3v3-working/`.

| Route | Loaded viewports | Desktop comparison | Mobile comparison |
| --- | --- | --- | --- |
| Carrier CRM | 1440x900, 1024x768, 390x844 | `comparison-vendors-1440x900.png` | `comparison-vendors-390x844.png` |
| RFx Process | 1440x900, 1024x768, 390x844 | `comparison-rfx-process-1440x900.png` | `comparison-rfx-process-390x844.png` |
| Bid Room | 1440x900, 1024x768, 390x844 | `comparison-rfx-events-1440x900.png` | `comparison-rfx-events-390x844.png` |
| Ratebook | 1440x900, 1024x768, 390x844 | `comparison-ratebook-1440x900.png` | `comparison-ratebook-390x844.png` |
| Invitation Admin | 1440x900, 1024x768, 390x844 | `comparison-outreach-1440x900.png` | `comparison-outreach-390x844.png` |

Raw in-app browser screenshots may be narrower than the requested viewport because browser chrome and scrollbar geometry are excluded from the captured content area. The comparison files use common 1440x900 and 390x844 canvases with aspect-preserving fit and padding. They are evidence composites, not claims that the raw screenshots were captured at identical byte dimensions.

The Build 05 wireframe is a composition blueprint rather than a business-data fixture. Comparisons therefore assess information hierarchy, shell density, control grouping, boundary visibility, responsive behavior, and Platform 55 visual language. Rateware's real labels, records, and governed states remain intact.

## Interaction QA

Only deterministic local fixture data was used. No production write, Supabase mutation, upload, approval, dispatch, or external delivery was attempted.

- Carrier CRM: switched from Pipeline to Directory and confirmed the carrier master grid loaded.
- RFx Process: switched the selected segment from Routes to Requirements and confirmed the carrier confirmation checklist loaded.
- Bid Room: switched from Build to Launch and confirmed the Carrier fit workspace loaded.
- Ratebook: selected the Draft status filter and confirmed the filtered ledger state remained coherent.
- Invitation Admin: switched from Campaigns to Draft Queue and confirmed generated-message controls remained disabled without a campaign.
- Browser console: zero warnings and zero errors during the 15 viewport checks.
- Responsive geometry: the five headings, evidence boundaries, and primary actions stayed visible with zero document-level horizontal overflow at 1440x900, 1024x768, and 390x844.

## Comparison findings

### Typography

- PASS: heading scale, eyebrow labels, compact metadata, and action emphasis follow the existing Platform 55 visual layer.
- PASS: no replacement font or unrelated type scale was introduced.

### Spacing and layout

- PASS: desktop pages use dense governed workspaces with clear left-to-right hierarchy.
- PASS: mobile pages collapse to a single decision stream while retaining primary action and evidence boundary above the operational data.
- PASS: wide operational tables stay within their own scroll surfaces instead of expanding the document.

### Color, borders, and elevation

- PASS: blue action hierarchy, neutral surfaces, subtle borders, and restrained radii match the existing Platform 55 shell.
- PASS: evidence boundaries use the established blue/green/yellow semantic accents without decorative additions.

### Copy and governance

- PASS: canonical identity is explicitly separated from procurement eligibility.
- PASS: RFx readiness is separated from release authority.
- PASS: a human remains the award authority.
- PASS: rate validity remains visible before export or controlled distribution.
- PASS: drafting remains separate from delivery.

### Images and source artifacts

- PASS: supplied Platform 55 source images are preserved as exact reference artifacts.
- NOTE: the fixed 1920x1080 Service 360 reference is used for desktop identity/detail comparison; the responsive Build 05 wireframe is used for the mobile Carrier CRM comparison so a desktop source is not misrepresented as a mobile target.

## Issues

- P0: 0
- P1: 0
- P2: 0
- P3: 1 — the supplied Build 05 reference is a generic composition blueprint, so content-level pixel equivalence is intentionally not asserted. Functional Rateware content is preserved inside the matching shell composition.

## Regression boundary

- P3-V3 contract: 7/7 passed.
- Existing Procurement shell contract: passed.
- Existing Platform 55 shell contract: passed.
- Historical Procurement evidence suite: its server checks pass, but the frozen P2 evidence parity check intentionally rejects the modified working tree until a P3-V3 source-supersession record is bound to an immutable candidate commit.
- Historical P3-V2 closure on current `main`: pre-existing failure because the validator requires the pre-squash evidence commit `e3e1c0bc0c89d76e4c8d595e4054a749164b2eff` to be an ancestor, while `main` contains the squash commit `f329b3c580ba9a7c3bf9f7836d2af4986f946f3f`.

Final result: passed for the local P3-V3 visual prototype; production/release credit withheld pending immutable candidate evidence, supersession wiring, independent review, preview authentication smoke, merge, and automatic production verification.
