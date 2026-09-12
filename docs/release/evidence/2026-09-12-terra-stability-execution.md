# Terra execution: Rateware stability candidate — 2026-09-12

## Scope and identity

- Checkout: `D:/andre/apps/codex-data/worktrees/Rateware/carrier-list-templates`
- Branch and candidate: `codex/carrier-list-templates` at `33f83e3cbf58cc2ab136ab5e8d623a516710ccb4` (`fix: stabilize bid room draft preparation`).
- Existing unrelated dirty and untracked files were preserved. No deployment, migration, provider publication, Gmail/WhatsApp send, invitation, or business-record action was performed.

## Executed local evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| R1 production-stable Bid Room delta | PASS, source-contract | `tests/astra-stability-regressions.test.mjs`: full `visibleLanes()` renderer, no progressive `laneRenderLimit`, eager Carrier Fit evidence load. |
| R3 WhatsApp preparation is provider-write-free | PASS, source-contract | The `generate_outreach_drafts` block no longer calls `publishOutreachTemplateToWhatsapp`; it reads `listWhatsappConnections` and `whatsappTemplateMapping`, reports `attempted: false`, and explicit publication remains in its separate action. |
| Read-only event detail/chat | PASS, source-contract | `loadDetail` no longer calls `ensureSelectedEventChatThread`; the explicit Start Event Thread control remains the invocation point. |
| R4 Gmail primary/secondary parity | PASS, focused behavior | `outreach-contact-readiness.js` selects the first syntactically valid primary or secondary email. The message and Carrier Fit surfaces expose that contact or the block reason. |
| RFx launch | PASS | `npm run test:rfx-launch-e2e`. |
| Rateware stability | PASS | `node tests/rateware-stability.test.mjs`. |
| Carrier List/Auth | PASS | `npm run test:carrier-list-templates`: browser domain tests, 12 Node tests, and 74 Deno contracts. |

Focused regression result: `node --test tests/astra-stability-regressions.test.mjs` passed 5/5.

## R2 boundary diagnostic

`tests/terra-stability-r2-boundaries.test.mjs` is test-only evidence; it does not expand the large-wave implementation.

- Explicit invitation IDs are normalized with `RFX_OUTREACH_INVITATION_ID_LIMIT = 50000`: 4,999, 5,000, 5,001, and 50,000 are within that input boundary; 50,001 is outside it.
- Explicit IDs are loaded in chunks of 100, so the above counts map to 50, 50, 51, and 500 chunks.
- The all-eligible/no-explicit-id path retains its 5,000 active-row guard.
- Lane hydration paginates in 1,000-row pages and checks `offset >= 25000` after accepting a full page. Therefore 24,999 completes, while exactly 25,000 and 25,001 take the current `safe per-batch limit` error path. This is the exact off-by-one boundary documented by Astra, not a resolved capacity contract.

## Action Contract diagnosis

The candidate changes the direct `edge.rateware-api.generate_outreach_drafts` handler. `tools/effective-action-contract.mjs` still pins this handler to source fingerprint `be536036…`, with a comment that expressly covers only the prior `7f8df29` 5,000-to-50,000 input-limit edit. It also has a finite list of reviewed shared `edge.rateware-api.*` authorization-envelope fingerprints, none established for this candidate's changed handler source.

The validator rules treat these as blocking errors: `SOURCE_FINGERPRINT_CHANGED` for the changed action and `AUTHORIZATION_ENVELOPE_CHANGED` for rateware-api actions sharing the altered envelope. This is expected contract drift, not a reason to mass-approve unrelated changes.

The repository exposes `tools/discover-action-contract.mjs` for deterministic discovery only; it has no narrow write/regeneration mode for reviewed fingerprints. Because the approved contract deliberately uses static reviewed pins, automatic manifest refresh is **not** the prescribed safe normal implementation step here. A subsequent review must compute the candidate's exact handler and shared-envelope fingerprints from a clean candidate tree, update only the `generate_outreach_drafts` source pin and the rateware-api shared-envelope allowlist, then re-run the validator. Do not regenerate or bless the full contract from this dirty checkout.

## Decision

**NO-GO for nonproduction acceptance.** The local R1/R3/R4 regression evidence is positive, but the unresolved Action Contract review and R2 25,000-row exact-limit behavior block acceptance. The required next action is a clean-tree, reviewed, narrowly scoped Action Contract refresh plus a real isolated large-wave/failure-recovery run. No production promotion is authorized.

## Second run — exact stabilized head `f7a99f86bc06bdcb5768fcb8492b75424ccf4908`

This second local-only gate reviewed `79d6e4645e157c6b5ff9d9b9b6ccdaf0afbc54dc` (`fix: bound outreach hydration pagination`) and `f7a99f86bc06bdcb5768fcb8492b75424ccf4908` (`chore: review outreach action contract`). No deployment, migration, provider call, publication, send, invitation, or business-record write occurred.

| Command | Result |
| --- | --- |
| `node --test tests/astra-stability-regressions.test.mjs tests/terra-stability-r2-boundaries.test.mjs` | PASS — 10/10. R1/R3/R4 remain covered; R2 accepts exactly 25,000, rejects only the next sentinel, uses deterministic keyset pagination, fails closed on duplicate/out-of-order pages, and checks the 50,000 carrier-lane matrix before coverage writes. |
| `node tests/rateware-stability.test.mjs` | PASS |
| `npm run test:rfx-launch-e2e` | PASS |
| `npm run test:carrier-list-templates` | PASS — browser domain, 12 Node, and 74 Deno contracts. |
| `node tools/validate-action-contract.mjs --json` | PASS — 415 contract entries, 413 discovered, 301 Edge, 112 PostgreSQL, 0 errors. The output has 12 informational duplicate action-name notices and one pre-existing `DECLARATION_PATH_MISSING` warning for `declaration.edge.whatsapp-healthcheck`. |

The `f7a99f86` contract change is narrowly consistent with `79d6e464`: it changes only the `generate_outreach_drafts` source fingerprint to `a94ce49a…` and adds the one reviewed Rateware API authorization envelope `29371be6…` to the pre-existing shared-envelope allowlists. No action metadata, action inventory, permission key, tenant scope, or unrelated source pin was added or altered. The validator's zero-error result verifies the discovered handler and envelope against that precise review.

`tests/action-contract.test.mjs` was started in the same local run. Its output did not complete before the acceptance checkpoint, so it is not counted as a passed gate in this report.

### Second-run decision

**GO to proceed to the existing authorized isolated nonproduction acceptance only; NO-GO for production.** The local source/contract gates now pass. P3-A remains blocked on the actual isolated environment and migration replay; P3-B remains blocked on authenticated tenant/permission and retry evidence; P4 remains blocked on an isolated deployed journey with synthetic fixtures, provider-call interception, large-wave/failure-recovery reconciliation, and visual/runtime measurements. These gates require their own environment authorization and are not closed by local contracts.
