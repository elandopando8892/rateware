# Provider Service Onboarding — Security

Describes controls that exist in code as of `8a187b0`. Controls that are absent are
named as absent.

---

## 1. Trust boundaries

```
browser ──► shipper-directory-api (Kinde JWT)
              └─ resolveProviderServiceScope: Kinde → workspace_registry → organization_uuid
                   ├─ read handlers  ──► sanitized views (service_role)
                   └─ command table  ──► shared command modules (service_role)
                                          └─ security definer RPCs
```

The browser never reaches a table. It reaches an action name; the handler resolves the
tenant itself and passes it down.

### Tenant resolution is not caller-supplied

`resolveProviderServiceScope` maps the Kinde `organization_id` claim through
`workspace_registry` to an `organization_uuid`, rejecting a workspace with no mapping.
Every read filters `.eq("organization_id", organizationUuid)`.

The command modules accept `organization_id` in their input object, which makes merge
order security-critical:

```ts
const input = { ...body, organization_id: organizationUuid };   // correct
const input = { organization_id: organizationUuid, ...body };   // browser picks its tenant
```

`tests/provider-onboarding-read-actions.test.mjs` asserts no handler reads
`body.organization_id`; `tests/provider-onboarding-review-command-wiring.test.mjs` pins
the merge order and asserts a single dispatch site.

---

## 2. Disclosure control

Four `security_invoker` views project posture, never payload:

| View | Withheld |
| --- | --- |
| `provider_entity_vault_workspace` | storage bucket, storage path, file hash, original filename, metadata jsonb |
| `provider_onboarding_field_review` | proposed values for restricted / highly restricted fields; value hashes; reviewer corrections (flag only) |
| `provider_onboarding_approval_queue` | manifest hash (reports `manifest_bound` only) |
| `provider_onboarding_delivery_workspace` | recipient and mailbox local parts, subject, body, attachment hash, Gmail ids |

`public`, `anon` and `authenticated` are revoked on all four and confirmed denied against
a live database. `service_role` holds select only.

**`security_invoker` requires base-table grants.** The view executes with the caller's
privileges, so granting select on the view alone leaves every read failing with
`permission denied`. This was a real defect on this branch, fixed and pinned by a test.

**Withheld ≠ hidden.** A withheld field still reports `has_proposed_value: true`, so a
reviewer knows work is pending without seeing an EIN or a bank name.

**`is_releasable` ≠ sendable.** It means "may be considered for a package". Sending still
requires an approved release package, and restricted or highly restricted documents still
require explicit human approval (`requires_human_release_approval`).

---

## 3. Approval integrity

`provider_onboarding_decide_release_package_approval` — `security definer`,
`search_path = public, pg_temp`, actor passed explicitly (no `current_user`).

- Package row locked `for update`; revoked, non-pending and expired packages refused.
- Separation of duties checked before any write; also a table constraint.
- Role allowlisted; decision note mandatory — an unexplained approval is not auditable.
- Approvals counted only against `package_revision`, so a re-cut package cannot inherit
  approvals granted for different contents.
- Identical decision replays idempotently; a changed decision is refused, not overwritten.

Uniqueness is `(organization_id, package_id, package_revision, approver_actor_id)`.
The original key omitted the revision while counting included it, making a re-cut package
permanently unapprovable — fixed in `434a65f`.

`provider_onboarding_revoke_release_package` cascades to any **active** signature
authorization for the package: consent issued against approved contents must not outlive
the approval that justified it.

---

## 4. Signature consent

Consent binds to package, recipient, purpose, manifest, signer, method, expiry — **and
now to the template and its hash**, folded into `scope_sha256`.

Before this branch, consent scoped to a package only. Assembly checked that an active
authorization existed for the package but not that it was issued for *that template*, so a
signature authorized on a tax form was consumable against a personal-guarantee form in the
same program. `template_id` and `template_sha256` close that, checked at **queue time and
again at assembly time** — a template can be re-cut in between.

The assembler adds two more:

- the template must still hash to its registered value, or assembly refuses and stores
  nothing;
- a stored signature is drawn only at operator-approved coordinates, and its asset is
  re-hashed against the registered `file_sha256` before embedding.

`provider_onboarding_revoke_signature_authorization` refuses a **consumed** authorization:
a signed artifact already exists, so revoking would misrepresent history. Revoke the
package instead.

---

## 5. Artifact handling

- Assembled artifacts upload with `upsert: false` — an artifact can never overwrite another.
- No public URL is ever requested. A test asserts `getPublicUrl` is never called.
- Every refusal path stores nothing; tests assert `uploads.length === 0` on each.
- Flat PDFs without approved overlay coordinates and legacy XLS/DOC refuse rather than
  emit a degraded artifact.
- Template bytes are asserted immutable after every fill.

---

## 6. Controls that do NOT exist yet

Named plainly so they are not assumed:

- **No malware scanning.** MIME and extension are validated and disagreement is an error;
  content is not scanned.
- **No page-count or extraction timeout bounds.** File size is bounded at 25 MB.
- **No RLS predicate on the onboarding tables for browser roles** — browser access is
  revoked outright rather than filtered, which is stronger but means RLS is not the
  boundary being relied on.
- **No end-to-end authorization test.** Cross-tenant isolation is enforced by the resolver
  and asserted by source inspection; no test issues two tenants' requests and confirms
  isolation over HTTP.
- **No approver role assignment.** The role allowlist is enforced, but nothing maps a user
  to a role, so the approval commands are unusable in production.
- **No sender allowlist or recipient-domain policy**, which is why form assembly and Gmail
  delivery remain unwired.

---

## 7. Operational hazard

`20260801015155_harden_public_data_api_access.sql` loops over every public table taking
`AccessExclusiveLock` to enable RLS. Against a database with live connections this can
deadlock — observed once locally with PostgREST and pg_cron attached, and it did
(`SQLSTATE 40P01`). Set `lock_timeout` and retry when applying it to production.
