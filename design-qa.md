# Carrier List Templates design QA

## Comparison target

- Source visual truth:
  - `docs/superpowers/specs/assets/carrier-list-templates/01-template-library.png` — 1486 x 1059 px.
  - `docs/superpowers/specs/assets/carrier-list-templates/02-template-builder.png` — 1487 x 1058 px.
  - `docs/superpowers/specs/assets/carrier-list-templates/03-carrier-fit.png` — 1487 x 1058 px.
- Browser-rendered implementation:
  - `docs/superpowers/specs/assets/carrier-list-templates/qa/implementation-library.png` — 1488 x 1059 px.
  - `docs/superpowers/specs/assets/carrier-list-templates/qa/implementation-builder.png` — 1488 x 1059 px.
  - `docs/superpowers/specs/assets/carrier-list-templates/qa/implementation-carrier-fit.png` — 1478 x 1052 px.
- Full-view comparison evidence:
  - `docs/superpowers/specs/assets/carrier-list-templates/qa/comparison-library.png` — 1490 x 574 px.
  - `docs/superpowers/specs/assets/carrier-list-templates/qa/comparison-builder.png` — 1490 x 574 px.
  - `docs/superpowers/specs/assets/carrier-list-templates/qa/comparison-carrier-fit.png` — 1490 x 574 px.
- CSS viewport: 1488 x 1059 px desktop, `deviceScaleFactor: 1`. The Carrier Fit capture excludes a 10 x 7 px browser-edge remainder; the comparison composite normalizes each source/implementation pair to equal-width panels without changing aspect ratio. Browser chrome is excluded.
- States:
  - Library: Carrier CRM > List Templates, Active view, first template selected.
  - Builder: step 2, Carrier CRM source, four selected members, editable name and description retained.
  - Carrier Fit: Bid Room > Launch, Cross-Border starting set, four eligible rows selected.

Focused crops were not needed: the three source and implementation captures are near-identical desktop dimensions, and the text, controls, icons, table states, typography, spacing, and status treatments remained legible in the equal-panel comparison images. Interactive details that cannot be proven by a still image were verified in the browser separately.

## Findings

No actionable P0, P1, or P2 mismatch remains at commit `c65ec5fabe0defa14a5bbfc44d214b9d32d57e6d`.

- Fonts and typography: the implementation uses the existing Rateware type stack, weights, compact labels, section hierarchy, and table density. No material wrapping, truncation, weight, or line-height drift remains.
- Spacing and layout rhythm: the shell, sidebar, top bar, cards, stepper, split panes, table/detail composition, gaps, borders, radii, and vertical rhythm preserve the approved layouts. The permanent safety banner adds one explicit preview-only row.
- Colors and visual tokens: existing Rateware slate, brand, neutral, warning, success, and disabled tokens are used consistently. Inactive sidebar items are transparent/slate; only the active Carrier CRM item uses the brand treatment.
- Image quality and asset fidelity: these operational screens contain no source imagery, logos, illustrations, or decorative raster assets. Icons come from the project's existing icon system; there are no emoji, custom inline SVG substitutes, CSS drawings, or placeholder image assets.
- Copy and content: the approved Carrier CRM, List Templates, Carrier Fit, Message, and Delivery vocabulary is preserved. The selected-audience CTA uses the correct singular/plural grammar. Preview-only copy clearly states that data is simulated and no external action occurs.
- Icons and affordances: navigation, status, filters, selection, archive, collapse/expand, and primary actions remain visually consistent and labelled.
- Responsiveness and accessibility: desktop comparison is stable; responsive sidebar labels, expanded state, visible keyboard focus, semantic controls, and reachable core actions were verified. No clipping or persistent-control overflow was observed in the exercised viewports.

Intentional, non-blocking differences:

- [P3] The preview uses deterministic simulated counts and four library rows instead of production-scale density; pagination is therefore absent.
- [P3] The library shows the lifecycle filter `All` and an explicit Archive action, while the reference capture shows the active working set.
- [P3] Upload reconciliation is shown through the builder's Upload source path instead of appearing simultaneously below the CRM member panes.
- [P3] The persistent preview-safety banner is intentionally absent from the approved source screens.

## Comparison and fix history

1. Initial implementation/browser pass:
   - [P1] Builder name and description were lost on Save. Fixed in `5e7562f`; post-fix browser evidence confirmed both fields persist and Save draft / Activate become enabled.
   - [P2] Keyboard focus could move to the wrong interactive target. Fixed in `79d54ee`; post-fix keyboard traversal retained focus on the intended control.
   - [P2] Responsive sidebar controls lacked complete accessible Collapse/Expand naming and state. Fixed in `1c3b58d`; post-fix browser evidence confirmed all 13 labels and the correct expanded state.
   - [P2] The Carrier Fit CTA did not use the approved count-aware singular wording. Fixed in `1c3b58d`; post-fix evidence showed `Add 1 carrier to this RFx and open Message`.
   - [P2] Inactive sidebar selection treatment was too prominent relative to the source. Fixed in `c65ec5f`; computed styles and the final Library comparison show the inactive Command Center item transparent/slate and Carrier CRM alone active in brand colors.
2. Final full-view comparison:
   - Opened each normalized source-plus-implementation comparison image and reviewed hierarchy, typography, spacing, colors, copy, icons, states, and polish.
   - No actionable P0/P1/P2 mismatch remained. The differences listed above are preview-scope P3s or deliberate safety affordances.

## Browser behavior evidence

- Template details persist after Save; draft and activation transitions enable correctly.
- An activated in-memory template appears in the library.
- Carrier Fit partitions the selected template into eligible and already-present members, adds only the eligible audience, and reconciles to zero eligible on return.
- Message opens with no generated draft, no send action, and no Delivery side effect.
- Core navigation, tabs, stepper, source toggle, filters, selection, archive, sidebar collapse/expand, and primary CTA were exercised.
- Browser console warnings/errors: none.
- All data is deterministic and simulated; no authentication, Supabase, API, storage, communications, or external mutations are used by this public QA route.

## Implementation checklist

- [x] Approved library, builder, and Carrier Fit states rendered at the target desktop viewport.
- [x] Full-view source/implementation pairs compared in the same images.
- [x] Required fidelity surfaces reviewed.
- [x] Core interactions and keyboard behavior exercised in the browser.
- [x] Console checked for errors.
- [x] Preview safety boundary remains visible and enforced.

## Launch Readiness iteration — commit `913c7d5`

- Source visual truth: `docs/superpowers/specs/assets/carrier-list-templates/03-carrier-fit.png` — 1487 x 1058 px.
- Browser-rendered implementation screenshot: `tmp/launch-readiness-design-qa.png` — 1488 x 1059 px.
- Combined comparison evidence: `tmp/launch-readiness-qa-comparison.png` — source and implementation rendered together at equal panel widths.
- Cloud implementation: `https://rateware-qb5d51euy-elandopando8892s-projects.vercel.app/output/carrier-list-templates-preview`.
- Viewport: 1488 x 1059 CSS px, desktop, `deviceScaleFactor: 1`.
- State: Bid Room > Launch > Carrier fit, active exact-membership template loaded. The source shows its selected state; the persisted implementation screenshot intentionally captures the pre-selection state so the new readiness transition is visible. The cloud browser additionally verified the selected state with four carriers.

### Findings

No actionable P0, P1, or P2 finding remains.

- Fonts and typography: the new eyebrow, heading, metrics, and explanatory note reuse the existing Rateware hierarchy without introducing a competing type scale.
- Spacing and layout rhythm: the panel sits between Starting set and the carrier table, preserving the decision sequence. The four metrics remain one row on desktop and collapse to two columns below 900 px.
- Colors and visual tokens: the restrained green review treatment is distinct from warning and destructive states while remaining compatible with the approved blue/slate shell.
- Image quality and asset fidelity: the flow has no raster imagery. Existing project icons and controls remain unchanged; no replacement or placeholder asset was introduced.
- Copy and content: template version, RFx lane count, selection, exceptions, revalidation, and the no-draft/no-send boundary are explicit.
- Affordances and accessibility: the panel is a labelled section, its status changes with selection, and the original count-aware CTA remains the sole materialization action.

### Interaction evidence

- Empty state showed `Selection required`, zero selected, three lanes, five exceptions, and template snapshot `v1`.
- `Select all 4 eligible` changed the panel to `Ready for review` and updated the CTA to `Add 4 carriers to this RFx and open Message`.
- Simulated Add opened Message with four carriers, no draft, no send, and no Delivery queue mutation.
- Browser DOM contained the expected controls and no framework error overlay was detected.

### Comparison history

1. The approved source had no dedicated preflight summary, so operators had to infer launch scope from counts and the footer CTA.
2. Added a compact readiness panel using existing spacing, borders, status colors, and typography.
3. Post-change browser evidence confirmed the panel remains above the fold at 1488 x 1059, preserves the carrier table, and keeps the persistent CTA visible.

final result: passed

## Invitation Wave Review iteration — 2026-08-26

- Source visual truth: `docs/superpowers/specs/assets/carrier-list-templates/03-carrier-fit.png` — 1487 x 1058 px.
- Browser-rendered implementation: `tmp/review-wave-implementation-viewport.png` — 1487 x 1058 px at `deviceScaleFactor: 1`.
- Full-page implementation evidence: `tmp/review-wave-implementation.png`.
- Combined comparison evidence: `tmp/review-wave-qa-comparison.png` — source and implementation placed side by side without density scaling.
- Local implementation: `http://127.0.0.1:3111/output/carrier-list-templates-preview`.
- State: Bid Room > Launch > Carrier Fit, exact-membership template loaded, four eligible carriers selected, Review Wave expanded.

### Findings

No actionable P0, P1, or P2 finding remains.

- Fonts and typography: Review Wave reuses the approved Rateware type stack and hierarchy. Lane names, requirements, counts, and exception explanations remain legible without creating a competing display scale.
- Spacing and layout rhythm: the review is intentionally inserted between template scope and the candidate table. It adds decision depth above the fold, but preserves the persistent materialization CTA and the original left-to-right Carrier Fit hierarchy.
- Colors and visual tokens: coverage uses existing success, warning, and neutral tokens. Exceptions use the established warm warning surface; no new decorative palette was introduced.
- Image quality and asset fidelity: this operational flow has no photographic or illustrative assets. Existing project icons and controls remain intact, and no placeholder, emoji, handcrafted SVG, or CSS-drawn asset was introduced.
- Copy and content: every lane shows the selected audience, thin/uncovered states are explicit, exclusion reasons are human-readable, and the no-draft/no-send boundary remains adjacent to the final review.
- Affordances and accessibility: coverage and exception regions have labelled headings. `Review lane` is a semantic button that focuses the existing lane filter without adding participants. Status remains available in text, not color alone.
- Responsive behavior: at 900 x 900 CSS px the two-column review collapses to one column, `document.scrollWidth` is 890 for `window.innerWidth` 900, and no horizontal overflow or hidden persistent action was found.

### Interaction evidence

- `Select all 4 eligible` updated all three lane counts and the count-bearing materialization CTA.
- Coverage displayed 4, 3, and 2 selected carriers across the three deterministic RFx lanes; the third lane used the thin-coverage warning treatment.
- Exceptions displayed 2 already in RFx, 1 missing contact, and 2 unavailable members.
- The CTA remained `Add 4 carriers to this RFx and open Message`; it was not executed during this QA pass.
- Browser console warnings/errors: none.

### Comparison history

1. Approved Carrier Fit source: clear template selection and carrier table, but no per-lane audience review before materialization.
2. First Review Wave implementation: added compact lane coverage and exception composition inside the established readiness panel.
3. Post-change combined comparison: the new review preserves the approved shell, typography, controls, semantic colors, and persistent CTA. The carrier table moves lower by design because the new human decision gate now precedes selection confirmation.

Focused crops were not required because the combined 1487 x 1058 comparison keeps the new panel copy, metrics, controls, and source hierarchy legible. Interaction behavior and the responsive breakpoint were verified separately in the browser.

final result: passed
