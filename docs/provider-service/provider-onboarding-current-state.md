# Provider Service Onboarding — Current State (Phase 0 + Phase 1)

Branch: `feat/provider-service-onboarding-production`
Base: `origin/main` @ `c5200a3` ("Integrate Freight Cost Model Quote Desk Gmail delivery (#59)")
Date: 2026-08-17

This document records the verified baseline and the fit-gap matrix. It describes the
code that exists today, not an aspirational architecture.

---

## 1. Baseline validation (Phase 0)

Run from a clean `npm install` on Node v20.14.0.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm install` | PASS | exit 0, devDeps only (`@babel/parser`) |
| `npm test` (product regression, 17 suites) | PASS | exit 0 |
| `tests/provider-*.test.mjs` (37 suites, run individually) | PASS 37 / FAIL 0 | all green |
| `npm run validate:action-contract` | PASS | `contract=397 discovered=395 edge=291 postgres=104`, `errors=0 warnings=1 info=12` |
| `npm run test:action-contract` | PASS | "Action contract hardening tests passed." |
| `node tools/effective-action-contract.mjs` | PASS | no output, exit 0 |

### Pre-existing debt observed at baseline (NOT regressions)

1. `WARNING DECLARATION_PATH_MISSING declaration.edge.whatsapp-healthcheck` —
   a declared surface whose path no longer exists. Unrelated to onboarding.
2. 12 `INFO DUPLICATE_ACTION_NAME` entries (`get_profile`, `submit_profile`,
   `get_shipper`, `list_shippers`, `list_bid_room_chat`, … ) where one action name is
   served by two governed surfaces.
3. `contract=397` vs `discovered=395` — two declared actions are not discovered in
   source.
4. The provider-service suites are **not** wired into `npm test` or `npm run test:product`.
   They only pass because they are invoked directly. There is no `test:provider-service`
   script, so CI does not gate on them.
5. Clean migration replay from zero was **not** executed in this environment (no local
   Supabase/Docker stack available on this host). It remains unverified.

---

## 2. What actually exists

The backend is deep and real. The UI and the document engine are not.

**Database — substantial.** 345 migrations total, ~137 of them provider-service.
Builds 1–31 land real tables, guards, RLS, revokes and commands for: relationship core,
activation engine, document registry, cases, communications, agent runs, approvals and
signature operations, provider portal, compliance, integrations, Provider 360, health,
command center, Gmail intake, Gmail Pub/Sub push, legal-entity source of truth, entity
document ingestion, bounded upload, processing worker, document review, review commands,
fact promotion, onboarding readiness, case workflow, release packages, form assembly,
Gmail delivery, and the workspace read model.

**Edge functions — partial.** `provider-gmail-intake-api`, `provider-gmail-oauth-callback`,
`provider-gmail-push`, `shipper-directory-api`, plus `_shared/provider-entity-upload.ts`
(206 lines).

**Frontend — shells.** Four pages exist (`provider-service.html`,
`provider-onboarding.html`, `provider-communications.html`, `provider-gmail.html`) and are
linked from `app.html`. `src/provider-onboarding-page.js` is 44 lines,
`src/provider-onboarding-domain.js` 24 lines, `src/provider-onboarding-release-domain.js`
30 lines.

---

## 3. Fit-gap matrix

| Capability | Current state | Evidence | Gap | Production dependency |
| --- | --- | --- | --- | --- |
| Provider relationship / activation / cases / compliance / 360 / health | Schema + guards + RLS + domain tests | ~120 migrations, 37 green tests | None material for onboarding | — |
| Gmail OAuth + Pub/Sub intake | Edge functions present, idempotency migrations present | `provider-gmail-*` functions, `20260814030000`, `20260814040000` | Live OAuth client, Pub/Sub topic + IAM never configured | **Human**: Google Cloud project, OAuth consent, topic, IAM |
| Entity Vault (legal-entity facts, ingestion, review, promotion) | Schema complete | `20260814050000`–`20260814110000` | **No importer.** No tool ingests local files, hashes, MIME-validates, or uploads to a private bucket | Private bucket + service-role key |
| Private source corpus (`/mnt/data/*`) | **Not mounted on this host** | `Test-Path C:\mnt\data` → False | All 13 documents must be mounted before any real fact load | **Human**: mount corpus |
| Onboarding readiness / case workflow / tasks / SLA | Schema + read model | `20260814120000`, `20260814130000` | No task-generation worker wired to a runtime | Worker runtime |
| Release package / manifest / approvals | Schema | `20260814140000` | No Edge command surface; UI cannot approve | — |
| Signature consent | Schema (`provider_onboarding_signature_authorizations`) | `20260814150000` L56 | No consent-issuance or consent-consumption command surface | **Human**: signature policy, approver roles |
| Form assembly | **Metadata only** | `20260814150000` is 168 lines: 5 tables (`form_templates`, `form_field_mappings`, `signature_authorizations`, `form_assemblies`, `form_assembly_events`) and no assembly logic | **No document engine exists.** Repo-wide grep for `acroform`/`pdf-lib`/`xlsx`/`docx` returns zero onboarding hits | **Decision required** — see §4 |
| Field ontology + alias mapping | **Absent** | No `ontology` file anywhere in `src/` | Whole module (~40 canonical fields, EN/ES aliases, versioned) must be built | — |
| Gmail delivery + follow-up | Schema | `20260814160000` | No send command, no dry-run harness | **Human**: sender allowlist, recipient-domain policy |
| Onboarding UI | Read-only observation shell | `provider-onboarding-page.js` = 44 lines; only two actions exist server-side: `list_provider_onboarding_workspace`, `get_provider_onboarding_case` | Command Center, Pipeline, Case Workspace, Document Review, Entity Vault, Approval Center, Delivery Workspace are all **not built**. The page itself states: "This read-only workspace cannot approve, sign, assemble, send, or submit." | — |
| Onboarding command surfaces (approve field, confirm entity, authorize signature, request assembly, approve recipient, approve send, revoke) | **Absent from the Edge layer** | Only 2 onboarding actions found across `supabase/functions/` | ~12 commands to author + register in the Action Contract | — |
| Synthetic E2E release gate | Policy evaluator only | `provider-onboarding-release-domain.js` evaluates a *release-readiness policy*; `tools/validate-provider-onboarding-release.mjs` | Not an end-to-end flow test. The 16-stage synthetic flow (§18 Phase 9) does not exist | — |

---

## 4. Decision required before the form engine can be built

The prompt requires byte-level fill of PDF (AcroForm + flat + scanned), XLSX (formula- and
format-preserving), XLS, DOCX and DOC. The repo today has **one** devDependency and
**zero** runtime dependencies; it is a static site plus Deno edge functions.

Delivering this requires, at minimum:

- `pdf-lib` (AcroForm fill, overlay, signature placement),
- `exceljs` or `sheetjs` (XLSX without destroying formulas),
- `docxtemplater` + `pizzip`, or direct OOXML manipulation (DOCX),
- **an isolated converter process (LibreOffice headless) for legacy XLS and DOC** — which
  cannot run inside a Supabase Edge Function and needs its own container.

Every one of these is a new runtime dependency and the LibreOffice path is new
infrastructure. §15 of the brief forbids introducing new stack elements "without
authorization", and §24 forbids leaving the main flow as a mock. Those two constraints
collide here, so the choice is escalated rather than made silently:

- **Option A** — approve `pdf-lib` + `exceljs` + `docxtemplater` as runtime deps and a
  containerized LibreOffice sidecar for XLS/DOC. Full fidelity, real engine.
- **Option B** — approve the three JS libraries only; XLS and DOC are accepted as
  originals with a mandatory human-intervention task and no automated fill.
- **Option C** — no new dependencies; the form engine stays a metadata/plan layer and the
  acceptance criteria 6–11 cannot be met.

## 5. Other blocking human decisions

- Google Cloud project, Gmail OAuth client and consent screen for `carriers@xbfreight.com`.
- Pub/Sub topic name and IAM grants.
- Mounting the 13-file private corpus listed in §5 of the brief.
- Private Storage bucket name and retention for the Entity Vault.
- Approver assignments and separation-of-duties policy.
- Signature policy owner; sender allowlist; recipient-domain policy; rollback owner.
