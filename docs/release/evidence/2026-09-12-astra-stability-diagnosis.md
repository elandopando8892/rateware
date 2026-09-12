# Astra diagnosis: Rateware release stability — 2026-09-12

## Decision

**NO-GO for promoting the current candidate as the most stable release.** This is an evidence-backed source/history diagnosis and execution handoff, not authenticated end-to-end certification. The immediate work is a bounded stabilization release; freeze additional product expansion while repairing and proving the existing Carrier CRM → list template → Carrier Fit → Message → delivery preparation journey.

Requested division: Astra performs diagnosis and final independent review; Sol implements the agreed repair packets; Terra runs the reproducible acceptance and deployment procedures. Recommended effort: Astra high for diagnosis (xhigh for final cross-system review), Sol high for implementation (xhigh for queue consistency), Terra high for execution and failure reconciliation. These are task recommendations, not a claim that all three models already ran.

## Inspected identity and evidence strength

- Checkout: `D:/andre/apps/codex-data/worktrees/Rateware/carrier-list-templates`; branch `codex/carrier-list-templates`; HEAD `f0b9f7e` during review.
- The checkout is dirty, including unrelated product files, migration tooling and certification corrections. Do not publish the whole worktree or silently combine those changes into this release.
- Parent live inspection reports production deployment `dpl_BHDX3J8wBwXJEEUBDqjbqXYSsQvs`, READY, serving both production aliases. Production `src/rfx-events.js` matches `git show 99af4da:src/rfx-events.js` after line-ending and trailing-whitespace normalization and differs from candidate HEAD. This proves one served file's content relationship, not the deployment's full source tree.
- `99af4da` is not an ancestor of this candidate. `7f8df29` is present. A prior statement that the candidate contained both was incorrect.
- Parent fresh `npm run test:carrier-list-templates` passed: browser domain tests, 12 Node tests and 74 Deno contracts. They are local contracts/mocks, not deployed acceptance.
- Existing P3-V6 runtime smoke records 29 routes and 42 captures with deterministic read-only fixtures and baseline mode. Its normal geometry run still fails on Business Intelligence; the 261-state aggregate is explicitly NOT_CERTIFIED.
- No production mutation, deployment, invitation or communication was performed in this diagnostic.

## Prioritized findings

### R1 — P0: candidate can reintroduce behavior explicitly rolled back in production

Confirmed in Git: `99af4da` removed the progressive lane renderer and delayed Carrier Fit evidence loading. Candidate `src/rfx-events.js:10064` still slices lanes by `laneRenderLimit`; `:10442` still schedules Carrier Fit evidence only in the carrier workspace. The production file does not contain that progressive renderer.

Consequence: promoting the candidate wholesale would reintroduce the reverted implementation. The rollback commit's title alone does not prove that the old implementation is bug-free, but the divergence is sufficient to block an unqualified promotion.

Sol: reconcile the 49-line rollback diff intentionally on the existing branch; retain current Auth/templates and isolate any performance optimization from this restoration. Reuse known behavior before changing interaction semantics. If pagination is retained later, prove full-audience selection independently of visible rows.

Terra: compare served assets and source blobs; exercise 24, 25, 26, 69 and 250 lanes, filter/search/edit/focus, event switching during loading, Carrier Fit refresh, and selected-audience preservation. Record request counts, load time, responsiveness and final carrier/lane counts.

### R2 — P0: the 50,000 input cap is not an end-to-end large-wave fix

Confirmed in `supabase/functions/rateware-api/index.ts`:

- `:103`, `:29946` permit 50,000 selected invitation IDs.
- `:30043-30069` fetch explicit IDs in batches of 100. For this explicit-ID path the 5,000 pagination guard is not reached; it affects the no-ID/all-eligible path. Do not misidentify this guard as the screenshot's proven cause.
- `:30124-30140` rehydrates full lane coverage per 100 vendors and rejects at 25,000 rows. Exactly 25,000 rows also fail because a full final page increments the offset and throws before checking whether another page exists.
- `:30576-30594` repeats a 25,000 per-batch guard for history.

The user's example 89 carriers × 69 lanes = 6,141 lane-participant rows, larger than the old input limit despite a modest audience. The screenshot's specific old-limit message is consistent with older executing backend code, but no authenticated failing request/receipt or backend source mapping proves its current cause.

Sol: define one bounded business contract for carrier count, lane count and matrix size across selection, materialization, hydration, history and generation. Use deterministic pagination, exact-limit detection and recoverable batches. Do not merely raise every limit. Return carrier-level progress and a reconciled result including prepared, preserved, blocked and excluded counts.

Terra: test 4,999/5,000/5,001, 6,141, 24,999/25,000/25,001 and 50,000/50,001 participant matrices with synthetic data. Cover explicit selection and all-eligible independently; test Gmail, WhatsApp direct and WhatsApp groups separately. Assert full lane coverage with no omitted or duplicated carrier drafts and useful error classification on deliberate overflow.

### R3 — P1: preparation has hidden side effects and several partial-failure boundaries

Confirmed: direct WhatsApp generation calls `publishOutreachTemplateToWhatsapp` at `index.ts:29998`; helper `:16874` can POST a missing notifier to Meta at `:16913`. This is template publication, not sending a carrier message, but it is an external write during queue preparation. `ensureRfxEventVendorCoverage` at `:13384` inserts missing lane participants in batches; it is invoked before complete hydration at `:30107`. UI `src/rfx-events.js:10701-10726` creates the campaign before generating its drafts. A later failure can therefore occur after some preparatory state has changed.

Also, `src/rfx-events.js:10482` calls `ensureSelectedEventChatThread` after loading an event when a group thread is absent. Authenticated page opening must not be assumed read-only solely from the operator not pressing a write button; inventory that helper's effects before smoke execution.

Sol: separate provider readiness reads from explicit publication; make queue preparation's business writes recoverable with one stable operation identity and a receipt across stages. Preserve existing sent/replied history and retry identity. Reconcile partial results before retry rather than creating another campaign. Keep human confirmation for actual dispatch.

Terra: enforce network interception against real Gmail/Meta sends/publication in nonproduction. Inject failures after campaign creation, coverage batch 1, hydration and draft batch 1; retry the same operation and verify counts, stable campaign identity, historical preservation and no provider calls. Verify the actual chat-helper effect before calling a smoke read-only.

### R4 — P1: UI contact readiness is weaker than backend recipient selection

Confirmed source mismatch: `src/rfx-events.js:3195` checks only truthiness of `vendor.primary_email` for Gmail readiness. The backend `index.ts:30082` documents valid-secondary fallback and history keyed by contact. UI `:10681` can stop preparation when its simpler readiness predicate finds no eligible targets. This warrants tests for a blank primary and valid secondary; current impact is unproven until reproduced with the backend's actual contact policy.

Sol: share or align readiness semantics across CRM, Carrier Fit, Message and backend. Expose the actual chosen contact and block reason before preparation; preserve contact opt-out and history rules.

Terra: valid primary, secondary-only, malformed primary with valid secondary, bounced primary with eligible secondary, no contact, opt-out, WhatsApp phone and group-only cases. Assert the same carrier readiness and selected contact in all stages.

### R5 — P1: repeated whole-workspace rendering is a plausible cause of large-bid slowness

Confirmed work amplification: `src/rfx-events.js:10018-10032` recomputes dashboard, lane coverage, decisions, response board, launchpad, offers, award board and wizard on `renderLanes()`. `loadDetail :10439-10445` calls several of them again immediately, then repeats render work after context loading at `:10462-10466`. The lane table builds 22 columns. This demonstrates duplicated work; it does not quantify production latency or establish it as the sole cause.

Sol: after establishing the functional baseline, render only the active workspace and invalidate dependent calculations once per state change. Cancel or disregard stale event requests, preserve focus and selections, and separate essential detail from optional context without hiding readiness failures.

Terra: capture browser long tasks, request waterfall and backend timings for the same synthetic small/69-lane/large event before and after. Proposed acceptance budget: visible navigation response under 200 ms, no action-induced main-thread task over 200 ms, and usable Bid Room core within 3 seconds at P95 on an agreed staging/network profile. Establish measurements before treating these as passed gates.

### R6 — P1: template permissions are not deployed-acceptance evidence

Confirmed: template writes are controlled by `vendors:manage` (`src/carrier-list-templates.js:162`, `:1112`, `:1580`); access failure sets `canManage=false`. Auth takes roles/permissions from server-managed app metadata (`src/auth.js:127-137`). Existing evidence explicitly says local mocked permissions passed while deployed two-organization acceptance is missing.

Sol: retain server-controlled authorization; make missing permission, expired session, disabled feature and service failure distinct visible states. Do not enable controls unconditionally or trust editable metadata. Confirm the existing sales account's effective authorization via safe server-side evidence, not the appearance of an enabled button.

Terra: Google sign-in, cancellation/retry, expiry/refresh; editor/viewer and two organizations; create/save/load/edit/archive/reload templates using only existing CRM carriers; conflict/retry and archived-template handling in Carrier Fit. Verify denied cross-org and read-only requests leave zero rows changed.

### R7 — P1: visual acceptance evidence does not prove the promised UX

The independent P3-V6 review found synthetic state badges and DOM metrics mislabeled as a 261-capture acceptance matrix. Current aggregate code now labels itself static and NOT_CERTIFIED (`tools/platform55-p3v-aggregate-certification.mjs:185`), which is correct but leaves the real gate open. Runtime baseline-mode smoke does not close geometry drift or the full interaction/state matrix.

`rfx-events.html:7-11` loads five style layers: base, tokens, shell, procurement and visual parity. This is an observed cascade, not by itself a defect. The supplied screenshots demonstrate cramped navigation/table/message density; a current authenticated same-data visual comparison is needed before attributing those symptoms to particular CSS rules.

Sol: keep one navigation shell, a clear event header, one primary action per stage, visibly separate carrier candidates from event audience, and a Message workspace that clearly states recipients, chosen channel/contact, blocked count and draft-only status. Avoid adding another parallel workspace. Make hierarchy and legibility the implementation target, using approved MARKSMAN assets/tokens and documented font fallback approval.

Terra: capture real rendered desktop 1440×900, tablet 1024×768 and mobile 390×844 states: loading, empty, populated, permission denied, service failure, conflict, preparing, partial result and ready. Review navigation, focus, contrast, overflow, typography, logo and contact/message legibility. A badge with a state name is not a fixture. Use the same data in both baseline candidates.

## Baseline recommendation

Do not roll back the whole application to a historical shell release. That would risk reverting Google/Supabase Auth and current template permissions and would not prove the bulk-preparation flow.

Use the production Bid Room behavior represented by the `99af4da` file as the starting functional comparison, preserving current validated Auth/template fixes. Compare its shell visually against the P2-S6 shell, release `7a146765ac38bd18a320f32f7e3ed7a7f13c8da7`. That older release has stronger breadth of historical shell evidence: seven authenticated/public routes, responsive sizes, keyboard behavior and 15-minute read-only observation (`docs/release/evidence/2026-08-21-p2-s6-production-smoke-monitoring.md`). It does not certify today’s workflows or 24–48-hour stability.

The P3-V1 release `209e40a` has exact deployment/tree evidence but only two authenticated routes and Kinde (`docs/release/evidence/2026-08-24-p3v1-production-closure.md`). It is a visual reference, not the recommended executable rollback target. No candidate has yet earned the label “most stable” for the entire required journey. Select the final visual treatment from the side-by-side evidence; do not infer the user's preferred old shell from a commit title.

## Ordered handoff and release gates

| Packet | Owner/model | Deliverable | Exit evidence |
| --- | --- | --- | --- |
| 0 — Freeze and reconcile | Sol high; Astra review | Explicit source inventory separating production, candidate and unrelated dirty edits; reconcile R1; two same-data shell previews | Source diff and side-by-side screenshots; approved visual base; no Auth/template regression |
| 1 — Reliable preparation | Sol xhigh | R2/R3/R4: consistent capacity, contacts, receipts, retry and provider separation | Executable synthetic matrix and injected-failure tests; carrier/lane/contact totals reconcile |
| 2 — UI stability | Sol high | R5/R6/R7: active-view rendering, honest capability/error states, selected visual hierarchy | Measured before/after performance; real responsive states and keyboard walkthrough |
| 3 — Isolated acceptance | Terra high, Astra independent review | P3-A/P3-B/P4, exact candidate in existing authorized nonproduction | Migration replay; two-org authenticated journeys; all critical regressions; no external sends; GO review |
| 4 — Production execution | Terra high | P5 exact approved artifacts, flags, smoke, rollback and observation | Frontend tree + Edge artifact + migration/config identity; authenticated production smoke; 24–48-hour stability evidence |

P3-A remains open until the actual isolated environment and migrations execute successfully; Docker availability is a runtime prerequisite, not a reason to label a source-only check complete. P3-B requires live tenant/permission and retry evidence. P4 needs an existing authorized isolated deployed environment with synthetic fixtures. Respect the no-new-branches/no-paid-resources constraints; if no such environment is available, ask for the specific environment decision after preparing all runnable work.

The regression matrix also includes XLSX/PDF/image/email intake preserving source → `rate_staging` → human approval, RFx CRUD/lane operations, RateBooks reads and approved handoffs. Template and shell tests alone do not certify those requirements.

For P5 record the exact frontend revision/tree, Edge function artifact/source relation, database migration state, relevant flags and Auth configuration together. HTTP 200 and Vercel READY alone are insufficient. Only then execute the already authorized production transition, authenticated smoke and scheduled 24–48-hour stability observation, with no invitations/messages. A failed critical gate returns to its packet and reconciles any partial effect before retry.

## Remaining unknowns

- Current authenticated reproduction/operation receipt of the 5,000-row screenshot error.
- Complete production frontend/backend/database source mapping.
- Which historic shell the user specifically remembers, confirmed through same-data rendered comparison.
- Production latency attribution from browser and backend timings.
- Actual sales account effective template permissions and deployed two-tenant acceptance.
- Full large-wave Gmail/WhatsApp preparation and failure-recovery behavior in isolated deployment.
- Complete visual state matrix, critical intake/RateBook regressions and 24–48-hour release stability.

These unknowns are required evidence, not claims that every corresponding feature is broken. The diagnosis supplies concrete work and pass/fail criteria; it does not authorize replacing those criteria with mock or static success.
