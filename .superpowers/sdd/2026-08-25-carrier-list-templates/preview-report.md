# Carrier List Templates simulated preview report

## Outcome

Implemented the public, no-auth, noindex Carrier List Templates QA preview against the three approved desktop references. The experience runs entirely from deterministic in-memory data and preserves the business gates: templates use existing Carrier CRM IDs, Carrier Fit selects only currently eligible members, and the Message handoff performs no draft, send, invitation, persistence, or Delivery action.

## Implemented states

- **Template library** — name/description search, lifecycle filtering, row/detail selection, and local duplicate/archive/restore controls.
- **Template builder** — exact `Details`, `Add carriers`, `Review`, and `Save` steps; existing-CRM add/remove/reorder; deterministic CSV/XLSX resolution preview for matched, ambiguous, not found, and duplicate rows; local draft or activation.
- **Carrier Fit** — active-template selection; real `partitionCarrierTemplateMembers` categorization; mutually exclusive eligible/already-in-RFx/missing-contact/unavailable counts; non-destructive filtered-out overlay; only visible eligible rows selectable; exact Add CTA.
- **Message confirmation** — confirms the selected local audience while explicitly stating that no draft, send, invitation, persistence, or Delivery action occurred.

## Safety and implementation boundaries

- No auth, Kinde, Supabase, Rateware API, vendor service, network, storage, service worker, persistence, invitation, draft, Delivery, or external-window integration.
- Uses the existing Platform 55 shell, token, procurement, and icon systems.
- Uses `reduceCarrierTemplateDraft` for builder membership changes and `partitionCarrierTemplateMembers` for Carrier Fit eligibility.
- The persistent banner reads `Preview con datos simulados · sin acciones externas`.
- Responsive styles, visible keyboard focus, semantic controls, row keyboard selection, and mobile navigation state are included.

## Files

- `output/carrier-list-templates-preview.html`
- `src/carrier-list-templates-preview.js`
- `src/styles.css`
- `tests/carrier-list-templates-preview.test.mjs`
- `.superpowers/sdd/2026-08-25-carrier-list-templates/preview-report.md`

## Verification

- `node --check src/carrier-list-templates-preview.js` — passed.
- `node --test tests/carrier-list-templates-preview.test.mjs` — 4 passed, 0 failed.
- `npm run test:carrier-list-templates` — browser domain tests passed; Deno contract suite 71 passed, 0 failed.
- `git diff --check` — passed.

Browser/design QA was intentionally not launched by this implementation agent; the controller owns the approved browser verification pass. No server, browser automation, deployment, or external action was started.

## Fix round 1

- The simulated Add handoff now materializes its exact selected audience into local RFx participant state before opening Message; returning to Carrier Fit classifies those carriers as `already_in_rfx` and prevents re-selection.
- Archiving the current Carrier Fit template deterministically selects the first remaining active template or an empty blocked state. Carrier Fit rejects draft and archived templates instead of silently falling back.
- Draft and active saves use the real `validateCarrierTemplateDraft` helper. Invalid saves remain in Builder, expose the domain validation messages, and never create an unnamed fallback template.
- Library filtering reconciles the selected detail to the visible result set; the misleading unimplemented detail-close control was removed.
- Render cycles restore focus by stable action key or the new screen heading, with explicit focus targets for route and builder-step transitions. Draft and Activate remain ordinary action buttons rather than incomplete tabs.

## Fix round 2

- Stable action-specific focus keys now cover filtered library rows, builder detail and query inputs, source controls, candidate selection, add/remove/reorder actions, import preview, and Carrier Fit selection controls.
- Removing a member restores focus to the next surviving member's Remove action, then the previous member when the removed row was last, and finally Add when no member remains.
- Render focus restoration retains the triggering control when it remains enabled; missing or disabled targets fall back to the current route or step heading.
- The builder source switch is an accessible labeled button group with ordinary `aria-pressed` buttons, with no incomplete tab semantics.
- A deterministic fake-DOM regression test covers retained focus, adjacent focus after removal, step focus, and heading fallback because the repository has no DOM harness dependency.
- `node --test tests/carrier-list-templates-preview.test.mjs` — 5 passed, 0 failed.

## Fix round 3

- Builder name and description now update the reducer state on every real `input` event without replacing the focused field, so the DOM node and caret remain stable while typing.
- Leaving Details performs a final local field flush before step navigation, protecting the draft even when automation or autofill changes a value without its expected event sequence.
- Library, builder-candidate, and Carrier Fit search fields now filter on `input`; result rerenders restore both the search focus key and its selection range.
- The executable input-transition regression reproduces Details → Add carriers → Review → Save with `US–Mexico Priority`, its description, and three members, then proves the active template preserves all three values.
- `node --test tests/carrier-list-templates-preview.test.mjs` — 6 passed, 0 failed.

## Fix round 4

- The Carrier Fit Add CTA now uses singular grammar only for one selected carrier and plural grammar for zero or two-or-more selections.
- Every collapsed-sidebar product button has a stable accessible name matching its visible product label: Command Center, Import, Source Files, Review Queue, Rateware, Analyze, Carrier CRM, RFx Process, Bid Room, Vendor Support, Vendor CI, Settings, and Learning Rules.
- The navigation collapse control exposes `Collapse navigation` while expanded and `Expand navigation` while collapsed, synchronized with `aria-expanded`.
- Focused contracts cover the exact 13 product labels, collapse-state semantics, and exact zero/one/two Carrier Fit CTA strings.
- `node --test tests/carrier-list-templates-preview.test.mjs` — 6 passed, 0 failed.
