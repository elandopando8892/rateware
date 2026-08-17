# Provider Service Onboarding — Test Matrix

As of `8a187b0`. Records what is verified, how, and what is not.

---

## 1. Commands

```bash
npm test                          # product regression, 17 suites
npm run test:provider-service     # 47 provider suites (added on this branch)
npm run validate:action-contract
npm run test:action-contract
node tools/validate-action-contract-delta.mjs --baseline-root <main-worktree>
node tools/validate-action-contract-no-regression.mjs --baseline-root <main-worktree>
node tools/verify-migration-history.mjs
node tools/validate-provider-service-runtime-syntax.mjs
npx supabase db reset --local     # clean migration replay from zero
```

Both contract validators take `--baseline-root <path>` **space-separated**; the `=` form
is silently ignored and the tool reports a missing baseline.

---

## 2. Current results

| Gate | Result |
| --- | --- |
| `npm test` | PASS |
| `npm run test:provider-service` | 47/47 PASS |
| `npm run validate:action-contract` | `400/398`, 0 errors, 1 pre-existing warning |
| delta | PASS — 0 unregistered surfaces |
| no-regression | PASS — 0 new authorization errors |
| `verify-migration-history` | PASS — 350 files |
| `validate-provider-service-runtime-syntax` | PASS — 40 files |
| `supabase db reset` | PASS — replayed 5× |
| `git diff --check` | clean |

---

## 3. Suites added on this branch

| Suite | Tests | Kind |
| --- | --- | --- |
| `provider-onboarding-ontology` | 13 | behavioural |
| `provider-onboarding-form-adapters` | 16 | behavioural, real libraries |
| `provider-onboarding-assembler` | 9 | behavioural, fake storage |
| `provider-onboarding-pipeline-domain` | 15 | behavioural |
| `provider-entity-vault-workspace` | 8 | structural (SQL) |
| `provider-onboarding-operator-read-models` | 10 | structural (SQL) |
| `provider-onboarding-read-actions` | 8 | structural (source) |
| `provider-onboarding-approval-commands` | 15 | structural (SQL + contract) |
| `provider-onboarding-signature-binding` | 10 | structural (SQL + source) |
| `provider-onboarding-review-command-wiring` | 9 | structural (source) |

**Behavioural** executes the code. **Structural** asserts on source or SQL text. Structural
tests catch regressions in intent but do not prove runtime behaviour — which is why the
database-level checks in §4 matter.

---

## 4. Verified against a live database

Local Supabase on Docker. Not automated; re-run manually after schema changes.

**Entity Vault** — expired MC authority, `never_release` bank letter and unverified
articles all `is_releasable = f`; verified W-9 releasable but
`requires_human_release_approval = t`. Counters: 4 total, 1 expired, 1 unverified,
2 restricted.

**Redaction** — restricted and highly restricted field values returned `NULL` with
`has_proposed_value = t`; public value returned. Delivery projected `provider.invalid` and
`mailbox.invalid` with no local part, subject or body.

**Grants** — all four views readable by `service_role`, denied to `anon` and
`authenticated`.

**Approval command**, 11 scenarios: self-approval refused; blank note refused; unknown role
refused; 1/2 stays pending; identical replay idempotent; decision flip refused; 2/2 →
approved with `approved_at`; approval after threshold refused; package revocation cascaded
consent to `revoked`; second revocation idempotent; approval on revoked package refused.
Event trail `package_approved,package_revoked`. Grants: `service_role` only.

**Revision scope** — revision 1 approved by two actors; package re-cut to revision 2; the
same two actors re-approved revision 2 (previously impossible); revision 1's approvals
neither blocked nor counted toward revision 2; both revisions' rows retained.

**Signature consent** — malformed template hash refused by constraint; unknown id and
blank reason refused; active authorization revoked; second revocation idempotent; consumed
authorization refused with a redirect to package revocation.

---

## 5. Verified in a browser

`provider-onboarding.html` served locally. The page's auth gate prevents a populated
render, so the pipeline rail and case chain were verified via a temporary harness page
against the real domain module and stylesheet, since removed.

All 16 stages render; exception stages carry `border-top-color: rgb(180,35,24)`; empty
stages sit at `opacity: 0.55`; chain steps render green/amber by state. No horizontal
overflow at 1280px or 375px — the rail reflows 8 columns to 2.

---

## 6. Not verified

Stated plainly so the matrix is not read as broader than it is.

- **No HTTP end-to-end test.** No edge function was deployed or invoked. Command wiring is
  asserted by source inspection; command bodies by direct SQL.
- **No cross-tenant isolation test.** Enforced by the resolver and asserted structurally;
  no test issues two tenants' requests and confirms isolation at runtime.
- **Approval queue view** — structural only. Functional fixtures need a
  `readiness_evaluation_id` chain that does not exist yet.
- **The 16-stage synthetic release gate** from the brief's Phase 9 does not exist.
- **No negative authorization tests** for unauthorized approve/send.
- **No storage policy tests.**
- **No Gmail idempotency tests** beyond what Build 16/17 already carried.
- **Legacy XLS/DOC** are asserted to be preserved byte-identical; no conversion is tested
  because none exists.
- **`validate-provider-service-runtime-syntax` PASS: 40 files** must not be read as
  evidence that a module is reachable — it parses files, and three of them are
  deliberately unwired.

---

## 7. Known flake

`supabase db reset` failed once with `deadlock detected (SQLSTATE 40P01)` in
`20260801015155_harden_public_data_api_access.sql` and passed on retry. That migration
takes `AccessExclusiveLock` on every public table in a loop and can deadlock against a
concurrent connection. Locally: retry. In production: set `lock_timeout` and retry.
