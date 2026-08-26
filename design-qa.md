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

final result: passed
