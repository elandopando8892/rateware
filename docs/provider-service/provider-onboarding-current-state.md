# Provider Service Onboarding — Current State

Branch: `feat/provider-service-onboarding-production`
Base: `origin/main` @ `c5200a3`
Head: `8a187b0`
Date: 2026-08-17

This document describes the code that exists, not an intended architecture. Where a
capability is absent or unreachable, it says so.

---

## 1. The finding that matters most

**Builds 22–29 authored seven onboarding command modules that no entrypoint imported.**

Their only references in the repository were `tools/validate-provider-service-runtime-syntax.mjs`,
which parses them as files, and tests that read them as text. No edge function called
any of them. The logic was well written — optimistic concurrency, ownership checks,
separation of duties — and completely unreachable over HTTP.

This explains the standing message in the onboarding workspace UI: *"This read-only
workspace cannot approve, sign, assemble, send, or submit."* It was accurate, and not
because a UI feature was missing.

It also means the runtime-syntax gate, which reports `PASS: 40 files`, was validating
files that never execute. That gate remains useful but must not be read as evidence
that a module is wired.

Eight commands are now reachable. Three remain deliberately unwired (§5).

---

## 2. Baseline at `c5200a3`

| Command | Result |
| --- | --- |
| `npm install` | PASS |
| `npm test` | PASS |
| `tests/provider-*.test.mjs` | 37/37 PASS |
| `npm run validate:action-contract` | PASS — `contract=397 discovered=395`, 0 errors, 1 warning |
| `npm run test:action-contract` | PASS |
| `node tools/effective-action-contract.mjs` | PASS |

Pre-existing debt observed then, and its status now:

1. `DECLARATION_PATH_MISSING declaration.edge.whatsapp-healthcheck` — **still open**, unrelated to onboarding.
2. 12 `DUPLICATE_ACTION_NAME` infos — **still open**, informational.
3. Contract/discovery gap of 2 declared-but-undiscovered actions — **still open**, now 400/398.
4. Provider suites not wired into CI — **fixed** (`npm run test:provider-service`, 47 suites).
5. Clean migration replay never executed — **fixed and repeatable** (§6).

---

## 3. What was added on this branch

13 commits, 32 files, ~4,100 insertions.

**Field ontology** — `_shared/provider-onboarding-ontology.mjs`. 35 canonical field codes
with data type, disclosure sensitivity and EN/ES aliases. Exact alias → confidence 1;
single-candidate containment → 0.6 with review required; multiple candidates → `ambiguous`
with the candidate list rather than a silent choice. Banking, trade-reference, credit,
bond and signature fields are `NEVER_INFERRED` and demand a reviewed canonical fact.
Missing or blank values return `proposed_value: null, status: 'pending'`.

**Form engine** — `_shared/provider-onboarding-form-adapters.mjs`. PDF AcroForm fill
(text/checkbox/radio/dropdown, values outside an option list refused); flat PDF returns
`requires_human_layout_review` without approved overlay coordinates; XLSX fill by
`Sheet!Cell` that refuses to overwrite formula cells; DOCX `{placeholder}` substitution.
Legacy XLS/DOC return the original byte-identical with a human-conversion task
(Option B, approved 2026-08-17). Runtime deps added: `pdf-lib`, `exceljs`,
`docxtemplater`, `pizzip`.

**Assembler** — `_shared/provider-onboarding-assembler.mjs`. Implements the
`ProviderOnboardingFormAssembler` interface declared in `provider-onboarding-form-assembly.ts`
and previously satisfied by nothing. Refuses assembly when the template no longer hashes
to the value registered at approval; applies a stored signature only at operator-approved
coordinates; re-hashes the signature asset against its registered `file_sha256`.

**Read models** — four sanitized `security_invoker` views: Entity Vault, field review,
approval queue, delivery workspace. See §4.

**Commands** — two new RPCs (approval decision, package revocation), one signature-consent
revocation RPC, plus the template binding that makes consent enforceable. See §5.

**UI** — 16-stage pipeline rail and a case workspace with a next-gate banner and a
controlled-output chain distinguishing done / pending / unreachable / failed / revoked.

---

## 4. Redaction, verified against a live database

Redaction is enforced in the views, and the edge handlers read only views — a test
asserts no handler reads `provider_legal_entity_document_assets`,
`provider_entity_document_review_fields`, `provider_onboarding_outbound_messages`
or `provider_onboarding_release_packages` directly.

Observed output with synthetic rows:

```
field_code  | sensitivity       | value_withheld | value                  | has_proposed_value
------------+-------------------+----------------+------------------------+-------------------
bank_name   | highly_restricted | t              | NULL                   | t
ein         | restricted        | t              | NULL                   | t
trade_name  | public            | f              | "Synthetic Trade Name" | t
```

A reviewer learns a value exists without seeing it. Delivery behaved the same way:
`ap.clerk@provider.invalid` and `ops@mailbox.invalid` project as `provider.invalid` and
`mailbox.invalid`; subject, body and attachment hash are absent entirely.

The Entity Vault omits `storage_bucket`, `storage_path`, `file_sha256`,
`original_filename` and the free-form metadata jsonb. All counters are partitioned by
organization; `anon` and `authenticated` are revoked on every view and confirmed denied.

---

## 5. Command reachability

| Command | Reachable | Notes |
| --- | --- | --- |
| `claim_provider_entity_document_review` | yes | Build 23 guards intact |
| `decide_provider_entity_review_field` | yes | withheld only for restricted; correction requires a value |
| `finalize_provider_entity_document_review` | yes | all fields decided first; no self-finalize |
| `promote_provider_entity_review_facts` | yes | |
| `open` / `reconcile` / `cancel_provider_onboarding_case` | yes | |
| `create_provider_onboarding_release_package` | yes | |
| `provider_onboarding_decide_release_package_approval` | RPC | canonical approval path |
| `provider_onboarding_revoke_release_package` | RPC | cascades to active signature consent |
| `provider_onboarding_revoke_signature_authorization` | RPC | consumed consent refused |
| `decideProviderOnboardingReleasePackage` | **no** | duplicate; counts approvals across all revisions |
| `queue`/`processProviderOnboardingFormAssembly` | **no** | external side effect; awaiting policy |
| Gmail delivery commands | **no** | external side effect; awaiting policy |

Dispatch is table-driven: one `Map` from action name to command, one dispatch site that
injects the resolved tenant and the authenticated actor. `{ ...body, organization_id:
organizationUuid }` — spreading the body last would let the browser choose its tenant, and
a test pins that ordering.

### Defects found and fixed on this branch

1. **Read model blanked its counters.** `listProviderOnboardingWorkspace` read org-wide
   window aggregates from `rows[0]` of a paged, filtered result; an empty queue reported
   every counter as zero. Now falls back to an unfiltered aggregate row, and the same
   fallback is in all four new list handlers.
2. **Vault view unreadable.** `security_invoker` means the view runs with the caller's
   privileges; granting select on the view alone left every `service_role` read failing
   with `permission denied`. Caught by reading *through* the view as that role.
3. **Assembled output mislabelled.** `form-assembly.ts` hardcoded the output path to
   `.pdf`, so every XLSX and DOCX assembly was mislabelled or failed its own path check.
4. **Ingestion rejected the common case.** `provider-entity-upload.ts` allowed only
   pdf/png/jpeg, so inbound XLSX and DOCX onboarding packets were refused.
5. **Re-cut packages were unapprovable.** The approval uniqueness key omitted
   `package_revision` while counting included it, so a revised package could never reach
   its threshold from the same approver set.
6. **Signature consent was not bound to the document.** Consent scoped to a package but
   not a template, so a signature authorized on one form was consumable against another
   active form in the same program. `template_id` and `template_sha256` now bind it, and
   the binding is checked at queue time *and* assembly time.

Defect 6 was real in code but not exploitable, because the assembly commands were never
reachable (§1).

---

## 6. Verification

Local Supabase via `npx supabase` on Docker.

| Gate | Result |
| --- | --- |
| `supabase db reset` (clean replay from zero) | PASS — 350 migrations, run 5× |
| `supabase db dump` | PASS — 22,676 lines |
| `npm run test:provider-service` | 47/47 PASS |
| `npm test` | PASS |
| `npm run validate:action-contract` | `400/398`, 0 errors, 1 pre-existing warning |
| `validate-action-contract-delta` | PASS — 0 unregistered surfaces |
| `validate-action-contract-no-regression` | PASS — 0 new authorization errors |
| `verify-migration-history` | PASS |
| `validate-provider-service-runtime-syntax` | PASS — 40 files (see §1 caveat) |
| `git diff --check` | clean |

**Migration replay deadlock.** One `db reset` failed with `deadlock detected (SQLSTATE
40P01)` in `20260801015155_harden_public_data_api_access.sql`, and passed on retry. That
migration loops over every public table taking `AccessExclusiveLock` to enable RLS, which
can deadlock against any concurrent connection — PostgREST and pg_cron were both attached.
Harmless locally; a real hazard against a production database with live connections. It
needs a `lock_timeout` and a retry in the rollout runbook.

**Not verified.** The approval queue view is covered structurally but not functionally —
its fixtures need a `readiness_evaluation_id` chain that does not exist yet. No edge
function was deployed or invoked over HTTP; command wiring is verified by source assertions
and the command bodies by direct SQL, not by an end-to-end request.

---

## 7. Action contract handling

The contract governs PostgreSQL RPCs with committed fingerprints and edge functions at the
function level; individual edge actions are not contract entries.

Adding onboarding logic to `provider-service.ts` changes the shared dependency envelope for
all eight pre-existing `shipper-directory-api` actions. Build 30 had already established an
override constant in `tools/effective-action-contract.mjs` for exactly this; it was
refreshed four times on this branch, each with its reason recorded inline rather than
overwriting the previous note. The delta and no-regression gates remain the substantive
check and pass throughout.

Inventory counts in `tests/action-contract.test.mjs` were updated for the three added RPCs
(395→398 governable, 104→107 rpc, 397→400 registered, 107→110 internal_only). These are a
census, not a behavioural claim.

---

## 8. What is still missing

**Blocked on a human decision:**

- Approver role assignments — who holds `operations`, `compliance`, `data_owner`, `legal`.
  The approval commands cannot be used in production without this.
- Sender allowlist and recipient-domain policy — gate on wiring form assembly and Gmail
  delivery at all.
- Gmail OAuth client, consent screen, Pub/Sub topic and IAM for `carriers@xbfreight.com`.
- The private corpus. `/mnt/data` is **not mounted**; none of the 13 documents listed in
  the brief are present, so no real canonical legal-entity facts exist. The importer is
  not built; the bounded-upload path (`_shared/provider-entity-upload.ts`) is the intended
  entry point.
- Whether `expected_revision` optimistic concurrency should be added to the canonical
  approval RPC (the unwired duplicate had it; the RPC does not).

**Not built:**

- Private corpus importer (hash, MIME validation, dedupe, classification, private upload).
- Operator UI for Entity Vault, Document Review, Approval Center, Delivery Workspace. The
  read models and read actions exist; the surfaces do not.
- The 16-stage synthetic end-to-end release gate described in the brief's Phase 9.
- Observability metrics.
- The remaining documents required by the brief's §23.
