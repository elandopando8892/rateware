# Carrier List Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Carrier CRM the single workspace for reusable, exact-membership carrier-list templates and let Bid Room Carrier Fit consume an active template as a starting set without creating carriers, changing the template, or sending invitations.

**Architecture:** Reuse `public.vendor_segments` for `segment_type = 'participant_template'`, but place template lifecycle behind explicit organization-scoped API actions. Keep pure normalization, upload matching, and Carrier Fit partitioning in small testable modules; let Carrier CRM own the library/builder and let Bid Room only read templates and materialize a human-selected eligible subset. Use optimistic versioning, reversible archive/restore, backend `vendors:manage` enforcement, an off-by-default server release flag, and the existing Message/Delivery queue approval gates.

**Tech Stack:** Static HTML/CSS, browser ES modules, SheetJS already used by Rateware, Supabase Postgres migrations, Supabase Edge Functions on Deno/TypeScript, Kinde JWT claims, Node `node:test`, Deno tests, existing action-contract validator, existing Bid Room browser verification.

**Spec:** `docs/superpowers/specs/2026-08-25-carrier-list-templates-design.md`

## Global Constraints

- Implement from the currently verified Vercel production source, not from the dirty control checkout. The verified 2026-08-25 snapshot is deployment `AvCeNfRhG3T5YzgehByP53h7Kcnc`, Git branch `main`, commit `f329b3c580ba9a7c3bf9f7836d2af4986f946f3f`; re-verify immediately before execution because this can drift.
- Create an isolated worktree and branch `codex/carrier-list-templates`. Never stage or commit unrelated control-checkout changes.
- If the live deployment SHA has advanced, use that newer SHA and redo the seam inventory before editing. If the deployment SHA is unavailable from Git, stop and reconcile the deployment source repository; do not substitute the stale local `main` commit `4742cce`.
- Cherry-pick only the approved design commit `175b5b57a861c49495a69c34c9f5066750f3eb4f` and the commit containing this plan into the clean implementation branch.
- `vendor_segments` remains the only persistence source for participant templates. Do not add a parallel `carrier_templates` table.
- Dynamic vendor segments retain their existing behavior. New template actions must not change `segment_type = 'dynamic'` queries, forms, or deletion semantics.
- Templates contain only existing `vendors.id` values from the actor's resolved `organization_id`. Never accept `organization_id`, owner fields, or permissions from the browser as authority.
- Reads are organization-scoped. Create, update, duplicate, archive, and restore require `vendors:manage` in the backend; disabled buttons are not an authorization boundary.
- A CSV/XLSX import is resolve-only. It must never insert, update, merge, archive, or delete a carrier.
- Loading a template never adds RFx participants, prepares messages, sends invitations, or changes the template.
- Adding selected carriers must remain idempotent and open Message only after successful reconciliation. Delivery queue remains the only send gate.
- No hard-delete control for participant templates. Archive and restore are reversible.
- The release flag defaults to disabled. Do not enable it, run a production migration, push, deploy, or promote without a separate explicit authorization.
- Tests and browser verification must use fixtures/fakes and must not send email, WhatsApp, bids, or live invitations.

---

## File Structure

| Area | Files | Responsibility |
|---|---|---|
| Execution baseline | external worktree, approved spec/plan commits | Start from the exact production source without contaminating the dirty checkout. |
| Database | `supabase/migrations/20260825160000_carrier_list_templates.sql` | Lifecycle, version, actor metadata, organization/name/member constraints, compatibility backfill. |
| Server domain | `supabase/functions/rateware-api/carrier-list-templates.ts`, `tests/carrier-list-templates.contract.test.ts` | Permission extraction, input normalization, deterministic row resolution, optimistic-write helpers. |
| API handler | `supabase/functions/rateware-api/index.ts` | Organization-scoped list/get/resolve/create/update/duplicate/archive/restore actions and audit events. |
| Browser domain | `src/carrier-list-template-domain.js`, `src/carrier-list-template-file.js`, `tests/carrier-list-template-domain.test.mjs` | Mutually exclusive Carrier Fit states and CSV/XLSX parsing/report generation. |
| Browser service | `src/vendor-service.js` | Typed wrappers for the explicit template API actions. |
| Carrier CRM | `vendors.html`, `src/vendors.js`, `src/carrier-list-templates.js`, `src/styles.css` | Shared library, details, builder, import preview, archive/restore, concurrency recovery. |
| Bid Room | `rfx-events.html`, `src/rfx-events.js`, `src/styles.css` | Read-only Starting set integration, current eligibility, exact CTA, legacy-editor retirement. |
| Governance/regression | `supabase/functions/_shared/action-contract.mjs`, `docs/authorization/action-contract.md`, `tests/action-contract.test.mjs`, `tests/rateware-stability.test.mjs`, `package.json` | Govern new actions and prove dynamic segments, permissions, and invitation gates remain intact. |
| Browser evidence | `tools/bid-room-e2e.mjs`, `tmp/carrier-list-templates-evidence/` | Local/non-production interaction proof with no communications. `tmp/` remains untracked. |

### Task 0: Establish the exact clean implementation baseline

**Files:**

- Read only: Vercel deployment metadata for `AvCeNfRhG3T5YzgehByP53h7Kcnc`
- Add by cherry-pick: `docs/superpowers/specs/2026-08-25-carrier-list-templates-design.md`
- Add by cherry-pick: `docs/superpowers/plans/2026-08-25-carrier-list-templates.md`

**Interfaces:**

- Consumes: live Vercel deployment metadata, Git object for the verified source SHA, design commit `175b5b5`, and this plan commit.
- Produces: clean worktree `C:\Users\andre\.codex\worktrees\Rateware\carrier-list-templates`, branch `codex/carrier-list-templates`, and a recorded baseline test result.

- [ ] **Step 1: Re-verify the production deployment source**

Use the authenticated Vercel deployment details or API and record `target`, `state`, `gitSource.ref`, and `gitSource.sha` in the execution log. The expected values from the approved-design session are:

```text
deployment: AvCeNfRhG3T5YzgehByP53h7Kcnc
target: production
state: READY
gitSource.ref: main
gitSource.sha: f329b3c580ba9a7c3bf9f7836d2af4986f946f3f
```

Stop if the project or deployment differs. If the SHA advanced, set `$productionSha` to the newly verified SHA and use it throughout this task.

- [ ] **Step 2: Fetch and prove the source commit exists**

```powershell
git fetch --all --prune
$productionSha = 'f329b3c580ba9a7c3bf9f7836d2af4986f946f3f'
git cat-file -e "$productionSha^{commit}"
git show -s --format='%H %D %s' $productionSha
```

Expected: `git cat-file` exits zero and `git show` prints the exact verified SHA. If not, stop and reconcile the Vercel-linked Git repository.

- [ ] **Step 3: Create the isolated worktree**

Invoke `superpowers:using-git-worktrees` before this step.

```powershell
$templateWorktree = 'C:\Users\andre\.codex\worktrees\Rateware\carrier-list-templates'
New-Item -ItemType Directory -Path (Split-Path -Parent $templateWorktree) -Force | Out-Null
git worktree add $templateWorktree -b codex/carrier-list-templates $productionSha
git -C $templateWorktree rev-parse HEAD
git -C $templateWorktree status --short
```

Expected: HEAD equals `$productionSha` and status is empty.

- [ ] **Step 4: Run and record the production-source baseline**

```powershell
npm ci
npm test
npm run validate:action-contract
npm run test:action-contract
deno check supabase/functions/rateware-api/index.ts
```

Run from `$templateWorktree`. Record exact pass/fail counts. Stop and classify any baseline failure before feature edits.

- [ ] **Step 5: Re-inventory the implementation seams**

```powershell
rg -n "participant_template|list_vendor_segments|create_vendor_segment|delete_vendor_segment" src supabase/functions tests vendors.html rfx-events.html
rg -n "Saved carrier list|Starting set|Carrier fit|Delivery queue" rfx-events.html src/rfx-events.js
rg -n "vendors:manage|permissions|requireKindeUser|workspaceUserContext" src supabase/functions
```

Expected: either the seams match the approved spec's baseline or the executor updates this plan before code. Do not force local dirty-checkout assumptions onto a different production snapshot.

- [ ] **Step 6: Bring the approved design and plan into the branch**

```powershell
$planCommit = git -C 'C:\Users\andre\OneDrive\Documents\Rateware' log -1 --format=%H -- docs/superpowers/plans/2026-08-25-carrier-list-templates.md
git -C $templateWorktree cherry-pick 175b5b57a861c49495a69c34c9f5066750f3eb4f $planCommit
git -C $templateWorktree status --short
```

Expected: the design, three approved wireframes, and this plan exist; status is empty.

### Task 1: Build and test the server-side template domain

**Files:**

- Create: `supabase/functions/rateware-api/carrier-list-templates.ts`
- Create: `tests/carrier-list-templates.contract.test.ts`

**Interfaces:**

- Consumes: raw Kinde claims, template payloads, normalized existing-vendor reference rows, and actor identity.
- Produces: permission guard, stable UUID normalization, canonical template rows, row-resolution results, and member-diff metadata without database writes.

- [ ] **Step 1: Write failing permission and lifecycle tests**

Create Deno tests that prove permission values are recognized in both supported claim locations and denied otherwise:

```ts
Deno.test('template writes require vendors:manage', () => {
  assertEquals(permissionKeysFromClaims({ permissions: ['vendors:manage'] }), new Set(['vendors:manage']));
  assertEquals(permissionKeysFromClaims({ 'https://kinde.com/permissions': ['vendors:manage'] }), new Set(['vendors:manage']));
  assertThrows(() => requireCarrierTemplateManagePermission({ permissions: ['vendors:read'] }), Error, 'vendors:manage');
});

Deno.test('draft may be empty but active may not', () => {
  const actor = { user_id: 'kp_1', email: 'buyer@example.com', organization_id: 'org-a' };
  assertEquals(normalizeCarrierTemplateInput({ segment_name: 'Mexico Core', lifecycle_status: 'draft', vendor_ids: [] }, actor).vendor_ids, []);
  assertThrows(
    () => normalizeCarrierTemplateInput({ segment_name: 'Mexico Core', lifecycle_status: 'active', vendor_ids: [] }, actor),
    Error,
    'at least one carrier'
  );
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
deno test --allow-env --node-modules-dir=none --no-lock tests/carrier-list-templates.contract.test.ts
```

Expected: failure because the new module/exports do not exist.

- [ ] **Step 3: Implement permission, name, UUID, and lifecycle normalization**

Export these exact public functions and constants:

```ts
export const CARRIER_TEMPLATE_MANAGE_PERMISSION = 'vendors:manage';
export const CARRIER_TEMPLATE_LIFECYCLES = new Set(['draft', 'active', 'archived']);

export function permissionKeysFromClaims(claims: Record<string, unknown>): Set<string>;
export function requireCarrierTemplateManagePermission(claims: Record<string, unknown>): void;
export function carrierTemplateNameKey(value: unknown): string;
export function normalizeCarrierTemplateVendorIds(value: unknown): string[];
export function normalizeCarrierTemplateInput(
  input: Record<string, unknown>,
  actor: { user_id: string; email: string; organization_id: string },
  options?: { existing?: Record<string, unknown>; lifecycle?: 'draft' | 'active' | 'archived' }
): Record<string, unknown>;
```

`normalizeCarrierTemplateVendorIds` must retain first-seen order, reject malformed values, and remove repeated UUIDs. `normalizeCarrierTemplateInput` must set `segment_type: 'participant_template'` and actor/org values from the server actor only.

Permission parsing must accept Kinde's string form and object form (`{ key: 'vendors:manage' }` or `{ name: 'vendors:manage' }`) from either supported claim key; malformed entries grant nothing.

- [ ] **Step 4: Add failing deterministic upload-resolution tests**

Cover exact in-workspace CRM ID, unique USDOT/MC, unique normalized email, name-only candidate, duplicate resolved member, ambiguous identifier, not found, and a foreign-org UUID. Use two same-name vendor fixtures so name matching can never auto-accept.

```ts
const result = resolveCarrierTemplateImportRows(rows, vendors, 'org-a');
assertEquals(result.summary, { total: 8, matched: 3, ambiguous: 2, not_found: 2, duplicates: 1 });
assertEquals(result.matched.map((row) => row.vendor_id), [vendorA.id, vendorB.id, vendorC.id]);
assertEquals(result.ambiguous[0].requires_manual_confirmation, true);
```

- [ ] **Step 5: Implement the resolution result contract**

```ts
export type CarrierTemplateImportResolution = {
  source_row_number: number;
  status: 'matched' | 'ambiguous' | 'not_found' | 'duplicate';
  reason: string;
  vendor_id: string | null;
  candidate_vendor_ids: string[];
  requires_manual_confirmation: boolean;
};

export function resolveCarrierTemplateImportRows(
  rows: Record<string, unknown>[],
  vendors: Record<string, unknown>[],
  organizationId: string
): {
  rows: CarrierTemplateImportResolution[];
  matched: CarrierTemplateImportResolution[];
  ambiguous: CarrierTemplateImportResolution[];
  not_found: CarrierTemplateImportResolution[];
  duplicates: CarrierTemplateImportResolution[];
  summary: Record<string, number>;
};
```

Matching precedence is exact workspace UUID, exact unique USDOT/MC from `profile_data.international`, exact unique email across primary/secondary emails, then exact normalized name as manual candidates only. Never perform fuzzy matching and never reveal a foreign-org carrier.

- [ ] **Step 6: Prove the pure server contract and commit**

```powershell
deno fmt --check supabase/functions/rateware-api/carrier-list-templates.ts tests/carrier-list-templates.contract.test.ts
deno test --allow-env --node-modules-dir=none --no-lock tests/carrier-list-templates.contract.test.ts
git diff --check
git add supabase/functions/rateware-api/carrier-list-templates.ts tests/carrier-list-templates.contract.test.ts
git commit -m "test: define carrier template domain contract"
```

### Task 2: Migrate participant templates to shared lifecycle and versioning

**Files:**

- Create: `supabase/migrations/20260825160000_carrier_list_templates.sql`
- Modify: `tests/rateware-stability.test.mjs`

**Interfaces:**

- Consumes: legacy `vendor_segments` participant-template rows and `workspace_identity_aliases`.
- Produces: organization-scoped lifecycle/version metadata, fail-closed backfill, constraints, indexes, and a same-organization membership trigger.

- [ ] **Step 1: Add failing migration contract assertions**

Read the migration source in `tests/rateware-stability.test.mjs` and assert the presence of:

```js
for (const field of ['lifecycle_status', 'template_version', 'created_by_user_id', 'updated_by_user_id', 'archived_at']) {
  assert.match(carrierTemplateMigration, new RegExp(field), `carrier template migration must define ${field}`);
}
assert.match(carrierTemplateMigration, /segment_type\s*=\s*'participant_template'/);
assert.match(carrierTemplateMigration, /workspace_identity_aliases/);
assert.match(carrierTemplateMigration, /raise exception/i);
assert.match(carrierTemplateMigration, /create unique index[\s\S]*lower\(btrim\(segment_name\)\)/i);
assert.match(carrierTemplateMigration, /cardinality\(new\.vendor_ids\)/i);
```

- [ ] **Step 2: Run the focused regression and confirm failure**

```powershell
node tests/rateware-stability.test.mjs
```

Expected: failure because the migration file does not exist.

- [ ] **Step 3: Add lifecycle, version, and actor columns**

Start the migration with additive columns so dynamic segments remain compatible:

```sql
alter table public.vendor_segments
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists template_version bigint not null default 1,
  add column if not exists created_by_user_id text,
  add column if not exists created_by_email text,
  add column if not exists updated_by_user_id text,
  add column if not exists updated_by_email text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id text,
  add column if not exists archived_by_email text;
```

Backfill actor fields from legacy owner fields without changing dynamic rows' meaning.

- [ ] **Step 4: Backfill organization and fail closed on unresolved rows**

Resolve null organizations by normalized `owner_email` or `owner_user_id` through `workspace_identity_aliases`. Then use a `DO` block that raises if any participant template remains unresolved:

```sql
do $$
declare unresolved_count bigint;
begin
  select count(*) into unresolved_count
  from public.vendor_segments
  where segment_type = 'participant_template'
    and nullif(btrim(organization_id), '') is null;
  if unresolved_count > 0 then
    raise exception 'carrier template migration blocked: % participant templates lack organization_id', unresolved_count;
  end if;
end $$;
```

Add a second fail-closed check for normalized duplicate names per organization before creating the unique index. Do not delete, rename, or merge any legacy template automatically.

- [ ] **Step 5: Add participant-template-only checks and uniqueness**

Add constraints equivalent to:

```sql
check (segment_type <> 'participant_template' or lifecycle_status in ('draft', 'active', 'archived'));
check (segment_type <> 'participant_template' or nullif(btrim(organization_id), '') is not null);
check (segment_type <> 'participant_template' or nullif(btrim(segment_name), '') is not null);
check (segment_type <> 'participant_template' or template_version >= 1);
check (segment_type <> 'participant_template' or lifecycle_status <> 'active' or cardinality(vendor_ids) > 0);

create unique index vendor_segments_participant_template_org_name_uidx
  on public.vendor_segments (organization_id, lower(btrim(segment_name)))
  where segment_type = 'participant_template';
```

Uniqueness includes archived templates so restore cannot create two templates with the same canonical name.

- [ ] **Step 6: Add the membership integrity trigger**

Create a trigger function that rejects duplicate UUIDs and any existing vendor whose `organization_id` differs from the template. It must deliberately allow a UUID that no longer exists so deleted members remain visible as `unavailable` instead of disappearing:

```sql
if cardinality(new.vendor_ids) <> (
  select count(distinct member_id) from unnest(new.vendor_ids) as member_id
) then
  raise exception 'carrier template vendor_ids must be unique';
end if;

if exists (
  select 1
  from public.vendors v
  where v.id = any(new.vendor_ids)
    and v.organization_id is distinct from new.organization_id
) then
  raise exception 'carrier template member belongs to another organization';
end if;
```

- [ ] **Step 7: Verify migration shape and commit**

```powershell
node tests/rateware-stability.test.mjs
rg -n "delete from public.vendor_segments|drop table|drop column" supabase/migrations/20260825160000_carrier_list_templates.sql
git diff --check
git add supabase/migrations/20260825160000_carrier_list_templates.sql tests/rateware-stability.test.mjs
git commit -m "feat: add carrier template lifecycle schema"
```

Expected: no destructive statement, focused regression passes, and the migration is not applied to any linked/production database.

### Task 3: Expose organization-scoped template API actions

**Files:**

- Modify: `supabase/functions/rateware-api/index.ts`
- Modify: `tests/carrier-list-templates.contract.test.ts`

**Interfaces:**

- Consumes: authenticated raw claims plus resolved workspace user, explicit action payloads, release flag `CARRIER_LIST_TEMPLATES_V2_ENABLED`.
- Produces: `list/get/resolve/create/update/duplicate/archive/restore` responses with organization isolation, `409` conflicts, and audit metadata.

- [ ] **Step 1: Add failing source-contract tests for authentication and flagging**

Require the handler to preserve both raw claims and resolved identity:

```ts
const claims = await requireKindeUser(request);
const user = await resolveWorkspaceUser(supabase, workspaceUserContext(claims), { persistIdentity: false });
```

Assert the new actions exist and that every write action calls `requireCarrierTemplateManagePermission(claims)`. Assert the flag defaults off:

```ts
const CARRIER_LIST_TEMPLATES_V2_ENABLED =
  (Deno.env.get('CARRIER_LIST_TEMPLATES_V2_ENABLED') || 'false').trim().toLowerCase() === 'true';
```

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
deno test --allow-env --node-modules-dir=none --no-lock tests/carrier-list-templates.contract.test.ts
```

- [ ] **Step 3: Preserve raw claims and add the capability guard**

Import the Task 1 functions. Resolve `claims` once before `workspaceUserContext`. Add a helper that returns `404` or a disabled capability envelope when the flag is false, without exposing template existence.

The eight template action names are exact:

```text
list_carrier_list_templates
get_carrier_list_template
resolve_carrier_list_template_rows
create_carrier_list_template
update_carrier_list_template
duplicate_carrier_list_template
archive_carrier_list_template
restore_carrier_list_template
```

- [ ] **Step 4: Implement list/get with organization scope and bounded pagination**

List accepts `lifecycle_status`, `search`, `limit <= 200`, and `offset`. It always includes `.eq('organization_id', user.organization_id).eq('segment_type', 'participant_template')`. Get uses the same scope and returns `404` for both absent and foreign-org IDs.

Return this stable envelope:

```ts
{
  enabled: true,
  rows,
  total,
  limit,
  offset,
  has_more: offset + rows.length < total
}
```

- [ ] **Step 5: Implement resolve as a read-only operation**

Load only current-organization vendor references including `id`, names, primary/secondary emails, `profile_data`, status, and base stage. Pass them to `resolveCarrierTemplateImportRows`. Do not call `.insert`, `.update`, `.upsert`, `.delete`, or a vendor mutation RPC in this branch.

- [ ] **Step 6: Add failing write/permission/version tests**

Test source/handler behavior for:

- no `vendors:manage` -> `403`;
- client-supplied foreign `organization_id` ignored/rejected;
- active empty -> `400`;
- duplicate name -> `409`;
- expected version mismatch -> `409` with `{ current_version, current_updated_at, template_id }`;
- archive/restore increments version;
- duplicate creates a new `draft` with a new ID and copied ordered members.

- [ ] **Step 7: Implement create/update/duplicate**

Create normalized rows with server actor/org. For update, require `expected_version` and make the write conditional:

```ts
const result = await supabase
  .from('vendor_segments')
  .update({ ...patch, template_version: expectedVersion + 1, updated_at: new Date().toISOString() })
  .eq('id', templateId)
  .eq('organization_id', user.organization_id)
  .eq('segment_type', 'participant_template')
  .eq('template_version', expectedVersion)
  .select()
  .maybeSingle();
```

If no row returns, re-read by scoped ID. Return `404` if absent and `409` with current metadata if present. Do not overwrite.

Before a create, every requested UUID must resolve to an existing vendor in the current organization. Before an update, every **newly added** UUID must resolve there; unchanged missing UUIDs are retained so a carrier deleted after the original save remains an auditable `unavailable` exception. Reject the entire write on any invalid/foreign addition and audit only IDs/counts, without disclosing the foreign carrier.

- [ ] **Step 8: Implement archive/restore without hard delete**

Archive sets lifecycle, actor, timestamp, and next version. Restore clears archive metadata, returns to `active`, validates at least one current same-org member, and uses the same `expected_version` barrier. If restore cannot activate, return a validation error and leave the row archived.

- [ ] **Step 9: Add distinct audit events with member diffs**

Use `tryWriteAuditLog` for:

```text
carrier_template.create_draft
carrier_template.activate
carrier_template.update_details
carrier_template.add_members
carrier_template.remove_members
carrier_template.duplicate
carrier_template.archive
carrier_template.restore
carrier_template.resolve_import
```

Metadata contains template ID, old/new version, counts, and added/removed UUIDs only. Do not log complete emails, phone numbers, or uploaded row contents.

`get_carrier_list_template` accepts only the server-recognized optional `usage_context: 'carrier_fit'`; when present it emits `carrier_template.load_in_carrier_fit`. The existing idempotent RFx participant-add action emits `carrier_template.add_selected_to_rfx` when it receives a validated template context.

- [ ] **Step 10: Close legacy participant-template authorization bypasses**

While the release flag is false, preserve the old participant-template behavior for rollout compatibility. Once enabled, make generic `create_vendor_segment`, `update_vendor_segment`, and `delete_vendor_segment` reject `segment_type = 'participant_template'` with an instruction to use the explicit template actions. Keep dynamic-segment behavior unchanged. Generic participant-template list calls may remain read-compatible but must use `organization_id`, never legacy individual owner scope.

- [ ] **Step 11: Verify handler types and commit**

```powershell
deno fmt --check supabase/functions/rateware-api/carrier-list-templates.ts tests/carrier-list-templates.contract.test.ts
deno test --allow-env --node-modules-dir=none --no-lock tests/carrier-list-templates.contract.test.ts
deno check supabase/functions/rateware-api/index.ts
node tests/rateware-stability.test.mjs
git diff --check
git add supabase/functions/rateware-api/index.ts tests/carrier-list-templates.contract.test.ts
git commit -m "feat: add carrier template API"
```

### Task 4: Add browser domain modules and API service wrappers

**Files:**

- Create: `src/carrier-list-template-domain.js`
- Create: `src/carrier-list-template-file.js`
- Create: `tests/carrier-list-template-domain.test.mjs`
- Modify: `src/vendor-service.js`
- Modify: `package.json`

**Interfaces:**

- Consumes: template rows, current vendor rows, current RFx participant IDs, current Carrier Fit filters, CSV/XLSX matrices.
- Produces: mutually exclusive eligibility groups, normalized import rows, exception CSV, and explicit API wrappers.

- [ ] **Step 1: Write failing Carrier Fit partition tests**

Use fixtures for eligible, already in RFx, missing contact, archived, deleted, foreign/unresolved, and filtered members. Assert every template member appears in exactly one bucket before visibility filtering:

```js
const groups = partitionCarrierTemplateMembers(input);
assert.deepEqual(groups.counts, {
  total: 7,
  eligible: 2,
  already_in_rfx: 1,
  missing_contact: 1,
  unavailable: 3,
  filtered_out: 1
});
assert.equal(
  groups.counts.eligible + groups.counts.already_in_rfx + groups.counts.missing_contact + groups.counts.unavailable,
  groups.counts.total
);
assert.equal(new Set(Object.values(groups.rows).flat().map((row) => row.vendor_id)).size, 7);
assert.deepEqual(groups.filtered_out_ids, [filteredVendor.id]);
```

- [ ] **Step 2: Run the Node test and confirm failure**

```powershell
node tests/carrier-list-template-domain.test.mjs
```

- [ ] **Step 3: Implement ordered membership and exclusive partitioning**

Export:

```js
export function templateMemberIds(template = {}) {}
export function partitionCarrierTemplateMembers({
  template,
  vendors,
  participantVendorIds,
  isContactUsable,
  isVendorAvailable,
  passesFilters
}) {}
```

Use primary-state precedence `already_in_rfx`, `unavailable`, `missing_contact`, `eligible`. These four arrays are mutually exclusive and always sum to total membership. `filtered_out_ids` is a separate visibility overlay, not a fifth primary state; it identifies primary-state rows hidden by current filters. Missing vendor rows become `unavailable` placeholders with their UUID. Preserve template order in every rendered result.

- [ ] **Step 4: Add failing CSV/XLSX parser and exception-report tests**

Test bilingual/legacy headings for `vendor_id`, `crm_id`, `usdot_number`, `mc_number`, `primary_email`, and `vendor_name`. Test blank rows, source row numbers, and CSV quoting. Parsing must not resolve or mutate carriers.

- [ ] **Step 5: Implement the file-only helpers**

Export:

```js
export function mapCarrierTemplateHeader(value = '') {}
export function rowsFromCarrierTemplateMatrix(matrix = []) {}
export function normalizeCarrierTemplateRows(rows = []) {}
export function carrierTemplateExceptionCsv(resolutionRows = []) {}
```

Keep SheetJS outside this pure module; the controller passes `XLSX.utils.sheet_to_json(..., { header: 1, defval: '' })` output into it.

- [ ] **Step 6: Add explicit service wrappers**

Add these functions to `src/vendor-service.js` without removing dynamic-segment functions:

```js
export const fetchCarrierListTemplates = (filters = {}) => callRatewareApi('list_carrier_list_templates', filters);
export const getCarrierListTemplate = (id, { usageContext = '' } = {}) => callRatewareApi('get_carrier_list_template', { id, usage_context: usageContext });
export const resolveCarrierListTemplateRows = (rows) => callRatewareApi('resolve_carrier_list_template_rows', { rows });
export const createCarrierListTemplate = (template) => callRatewareApi('create_carrier_list_template', { template });
export const updateCarrierListTemplate = (id, template, expectedVersion) => callRatewareApi('update_carrier_list_template', { id, template, expected_version: expectedVersion });
export const duplicateCarrierListTemplate = (id, name, expectedVersion) => callRatewareApi('duplicate_carrier_list_template', { id, name, expected_version: expectedVersion });
export const archiveCarrierListTemplate = (id, expectedVersion) => callRatewareApi('archive_carrier_list_template', { id, expected_version: expectedVersion });
export const restoreCarrierListTemplate = (id, expectedVersion) => callRatewareApi('restore_carrier_list_template', { id, expected_version: expectedVersion });
```

- [ ] **Step 7: Add the focused script and commit**

Add `test:carrier-list-templates` to `package.json` so it runs the Node and Deno domain suites. Then:

```powershell
npm run test:carrier-list-templates
git diff --check
git add src/carrier-list-template-domain.js src/carrier-list-template-file.js src/vendor-service.js tests/carrier-list-template-domain.test.mjs package.json
git commit -m "feat: add carrier template browser domain"
```

### Task 5: Build the Carrier CRM template library

**Files:**

- Create: `src/carrier-list-templates.js`
- Modify: `vendors.html`
- Modify: `src/vendors.js`
- Modify: `src/styles.css`
- Modify: `tests/rateware-stability.test.mjs`

**Interfaces:**

- Consumes: list/get/duplicate/archive/restore service actions and current Kinde access context.
- Produces: top-level Carrier CRM `List Templates` workspace, searchable/filterable library, detail panel, and reversible lifecycle controls.

- [ ] **Step 1: Add failing UI source-contract assertions**

Assert `vendors.html` has a top-level `data-vendor-tab="list-templates"`, not a nested dynamic-segment panel. Assert library controls exist for search, lifecycle filter, new, open, duplicate, archive, and restore. Assert no participant-template hard-delete label exists.

- [ ] **Step 2: Run the focused regression and confirm failure**

```powershell
node tests/rateware-stability.test.mjs
```

- [ ] **Step 3: Add the workspace shell and approved information hierarchy**

Add `List Templates` after Intelligence in the Carrier CRM workflow tabs. The panel includes:

```html
<section data-vendor-workspace="list-templates" hidden>
  <header>
    <p>Static carrier lists built only from carriers already in this workspace.</p>
    <button type="button" data-template-action="new">New template</button>
  </header>
  <input type="search" data-template-search aria-label="Search templates">
  <select data-template-status aria-label="Template status">
    <option value="active">Active</option>
    <option value="draft">Draft</option>
    <option value="archived">Archived</option>
    <option value="all">All</option>
  </select>
  <div data-template-library-table></div>
  <aside data-template-detail aria-live="polite"></aside>
</section>
```

Use existing Rateware tokens and component classes before adding new CSS.

- [ ] **Step 4: Implement capability discovery and shared library rendering**

Initialize `src/carrier-list-templates.js` from `src/vendors.js`. Calling list is the feature-capability check: when the server flag is disabled, keep the tab hidden; when enabled, render rows with name, description, member count, modified time, actor, status, and permitted actions.

Use `getAccessContext()` to determine whether to render enabled write controls, but let backend `403` remain authoritative. Do not change global `canUse()` semantics in this feature.

- [ ] **Step 5: Implement duplicate/archive/restore with version barriers**

Every row action passes its displayed `template_version`. On `409`, preserve the selected row, reload its current version, and show a comparison/retry message; never auto-retry the mutation. Archive/restore asks for a local confirmation but does not use hard delete.

- [ ] **Step 6: Add URL deep-link handling**

Support `vendors.html?tab=list-templates` and `vendors.html?tab=list-templates&template=<uuid>`. Preserve existing Carrier CRM tab links and browser history behavior.

- [ ] **Step 7: Verify keyboard and status behavior, then commit**

```powershell
node tests/rateware-stability.test.mjs
npm run test:carrier-list-templates
git diff --check
git add vendors.html src/vendors.js src/carrier-list-templates.js src/styles.css tests/rateware-stability.test.mjs
git commit -m "feat: add carrier template library to CRM"
```

### Task 6: Build the template wizard and import reconciliation preview

**Files:**

- Modify: `vendors.html`
- Modify: `src/carrier-list-template-domain.js`
- Modify: `src/carrier-list-templates.js`
- Modify: `src/styles.css`
- Modify: `tests/carrier-list-template-domain.test.mjs`
- Modify: `tests/rateware-stability.test.mjs`

**Interfaces:**

- Consumes: paginated CRM carriers, CSV/XLSX file, resolve preview, manual existing-carrier choices.
- Produces: four-step Details/Add carriers/Review/Save draft, ordered exact membership, exception report, and create/update payload with `expected_version`.

- [ ] **Step 1: Add failing wizard state tests**

Test a pure exported `createCarrierTemplateDraftState()` or reducer from `src/carrier-list-template-domain.js` for add/remove/reorder, stable dedupe, unresolved-row exclusion, manual match confirmation, dirty state, draft-save allowance, and active-save minimum member validation.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm run test:carrier-list-templates
```

- [ ] **Step 3: Implement the four-step accessible wizard shell**

Use four labelled steps exactly: `Details`, `Add carriers`, `Review`, `Save`. Back/Next must retain state. The close action must invoke the existing unsaved-changes guard when details, membership, or manual resolutions differ from the loaded version.

- [ ] **Step 4: Implement Add from Carrier CRM**

Page/search through existing vendors with current filters. The selected-members panel is the exact ordered UUID list. Add/remove changes only local draft state; it must not call `updateVendor`, `createVendor`, or any vendor import action.

- [ ] **Step 5: Implement CSV/XLSX parsing and server resolution**

Use the SheetJS import pattern already present in Carrier CRM. Parse the first sheet into a matrix, normalize it with Task 4 helpers, and call only `resolveCarrierListTemplateRows(rows)`. Reject unsupported file types and enforce a bounded row count before the API call.

- [ ] **Step 6: Render mutually exclusive import outcomes**

Show counts and row-level reasons for `matched`, `ambiguous`, `not_found`, and `duplicate`. Auto-add only `matched`. For `ambiguous`, let the operator search and choose one existing carrier; record the chosen UUID as a human resolution. Do not auto-accept a name candidate.

- [ ] **Step 7: Add downloadable exception CSV**

Generate a local Blob from `carrierTemplateExceptionCsv`. Include source row number, status, reason, supplied identifiers, and chosen vendor ID when manually resolved. Do not include CRM contact details that were not present in the uploaded file.

- [ ] **Step 8: Implement Review and Save behavior**

Review shows exact members, exceptions, and added/removed diffs. `Save draft` allows zero members. `Activate template` requires at least one member. Create uses `createCarrierListTemplate`; edit uses `updateCarrierListTemplate(id, payload, expectedVersion)`.

- [ ] **Step 9: Handle concurrent edit conflict without data loss**

On `409`, retain the local draft in memory, fetch the current server template, and display `Reload current` plus a local-vs-current member summary. No automatic merge or overwrite.

- [ ] **Step 10: Verify and commit the builder**

```powershell
npm run test:carrier-list-templates
node tests/rateware-stability.test.mjs
git diff --check
git add vendors.html src/carrier-list-templates.js src/carrier-list-template-domain.js src/styles.css tests/carrier-list-template-domain.test.mjs tests/rateware-stability.test.mjs
git commit -m "feat: build carrier template wizard"
```

### Task 7: Make Carrier Fit consume active templates without mutating them

**Files:**

- Modify: `rfx-events.html`
- Modify: `src/rfx-events.js`
- Modify: `src/styles.css`
- Modify: `supabase/functions/rateware-api/index.ts`
- Modify: `tests/carrier-list-template-domain.test.mjs`
- Modify: `tests/rateware-stability.test.mjs`

**Interfaces:**

- Consumes: active template list/get, current vendor rows, current RFx participants, Carrier Fit filters.
- Produces: exact starting set, exclusive current-state counts, valid subset selection, and existing idempotent add-then-open-Message flow.

- [ ] **Step 1: Add failing Carrier Fit source-contract assertions**

Assert Bid Room imports the explicit template service/domain functions, loads only `active`, includes the exact CTA text, and does not create/update/delete participant templates. Assert missing-contact and unavailable rows are disabled.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm run test:carrier-list-templates
node tests/rateware-stability.test.mjs
```

- [ ] **Step 3: Replace the generic saved-segment data source**

When Starting set is `saved_segment`, list only active carrier templates through `fetchCarrierListTemplates({ lifecycle_status: 'active' })`. Selecting a template immediately calls get and loads its ordered `vendor_ids`; no extra Load button and no auto-selection.

- [ ] **Step 4: Load current vendor/member evidence**

Fetch template IDs through `fetchVendors({ ids, lightweight: false })` in bounded pages. Preserve placeholders for IDs absent from the response. Re-read current RFx participants before enabling Add.

- [ ] **Step 5: Partition and render all approved states**

Use `partitionCarrierTemplateMembers`. Display primary counts for `eligible`, `already_in_rfx`, `missing_contact`, and `unavailable`; these always sum to total membership. Show `filtered_out` separately as the number currently hidden by filters, without reclassifying a member. Only visible eligible rows have enabled checkboxes.

- [ ] **Step 6: Implement individual and bulk selection rules**

`Select all {N} eligible` selects only visible eligible members. Changes in filters or refreshed RFx state remove now-ineligible IDs from selection. Already-in-RFx, missing-contact, unavailable, and filtered-out rows cannot be selected by mouse, keyboard, or stale DOM state.

- [ ] **Step 7: Use the exact CTA and revalidate before materialization**

The button label is:

```text
Add {N} carriers to this RFx and open Message
```

Immediately before the existing add call, re-fetch template metadata and RFx participants. If archived or version changed, block, preserve local selection, and ask the operator to reload. Otherwise pass only still-eligible selected IDs to the existing idempotent RFx/lane/vendor insertion path.

- [ ] **Step 8: Preserve Message and Delivery queue gates**

After a successful add/reconciliation, set the newly added audience and activate Message. If the add fails, remain in Carrier Fit and display the correlation ID. Do not create drafts or send. Delivery queue remains untouched.

- [ ] **Step 9: Audit load and add-selected events**

Call get with `usage_context: 'carrier_fit'` to record `carrier_template.load_in_carrier_fit`. Pass validated `{ template_id, template_version }` context into the existing idempotent RFx participant-add action so it records `carrier_template.add_selected_to_rfx`, including RFx, selected count, already-present count, inserted count, and result—never contact contents.

- [ ] **Step 10: Verify and commit Carrier Fit**

```powershell
npm run test:carrier-list-templates
node tests/rateware-stability.test.mjs
node tests/rfx-multilane-e2e.test.mjs
git diff --check
git add rfx-events.html src/rfx-events.js src/styles.css supabase/functions/rateware-api/index.ts tests/carrier-list-template-domain.test.mjs tests/rateware-stability.test.mjs
git commit -m "feat: load carrier templates in Carrier Fit"
```

### Task 8: Retire the duplicate Bid Room template editor

**Files:**

- Modify: `rfx-events.html`
- Modify: `src/rfx-events.js`
- Modify: `tests/rateware-stability.test.mjs`

**Interfaces:**

- Consumes: existing Build/Participants saved-list editor and event-specific file import controls.
- Produces: one link to Carrier CRM List Templates and no second participant-template mutation surface.

- [ ] **Step 1: Replace old positive assertions with failing single-source assertions**

Update stability tests to reject the old Build/Participants create/update/delete/import control IDs and to require `vendors.html?tab=list-templates`. Keep assertions for manual participant selection and the existing RFx add flow.

- [ ] **Step 2: Run the regression and confirm failure**

```powershell
node tests/rateware-stability.test.mjs
```

- [ ] **Step 3: Remove the legacy template mutation UI and listeners**

Remove only participant-template save/load/update/delete and event-specific template-file controls from Build/Participants. Replace them with explanatory copy and:

```html
<a href="./vendors.html?tab=list-templates">Manage carrier list templates in Carrier CRM</a>
```

Do not remove manual carrier addition, lane assignment, Carrier Fit, Message, or Delivery queue.

- [ ] **Step 4: Remove dead template-editor state without removing shared parser helpers still in use**

Use `rg` to prove removed element IDs/listeners have zero references. If file parsing is no longer used anywhere in Bid Room, remove those functions/imports; otherwise retain only live non-template consumers.

- [ ] **Step 5: Verify and commit the single-source change**

```powershell
rg -n "participant-template-(save|update|delete|file)|delete_vendor_segment" rfx-events.html src/rfx-events.js
node tests/rateware-stability.test.mjs
node tests/rfx-multilane-e2e.test.mjs
git diff --check
git add rfx-events.html src/rfx-events.js tests/rateware-stability.test.mjs
git commit -m "refactor: centralize carrier templates in CRM"
```

Expected: no old mutation control remains; Carrier Fit read/use behavior remains.

### Task 9: Govern actions and run the complete regression suite

**Files:**

- Create: `supabase/functions/_shared/action-contract-carrier-list-templates.mjs`
- Modify: `tools/effective-action-contract.mjs`
- Modify: `tools/action-contract-lib.mjs`
- Modify/generated: `docs/authorization/action-contract.md`
- Modify: `tests/action-contract.test.mjs`
- Modify: `tests/carrier-list-templates.contract.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: eight new Edge selector actions and the repository's action-contract generator/validator.
- Produces: governed read/write surfaces, updated expected counts/fingerprints, and full local regression evidence.

- [x] **Step 1: Add failing action governance assertions**

Require all eight new actions in `ACTION_CONTRACT.surfaces`. Reads (`list`, `get`, `resolve`) must be `access: 'read'`; create/update/duplicate/archive/restore must be `access: 'write'`, tenant-scoped, and proposed permission `vendors:manage`.

- [x] **Step 2: Run the validator and confirm the expected drift**

```powershell
npm run validate:action-contract
npm run test:action-contract
```

Expected: failure reports the new ungoverned actions/count/fingerprint drift.

- [x] **Step 3: Reconcile the effective contract with repository tooling**

The frozen Phase 0 base remains unchanged. A static additive extension records values produced by reproducible inventory, and the effective contract composes it with reviewed source, metadata, and authorization fingerprints. The resolve action is read-only even though it receives rows. Archive/restore are writes but not destructive hard deletes.

- [x] **Step 4: Add the new focused suite to root `npm test`**

Place `npm run test:carrier-list-templates` before broad Bid Room regressions, without removing existing suites.

- [x] **Step 5: Run focused, type, and governance verification**

```powershell
npm run test:carrier-list-templates
deno check supabase/functions/rateware-api/index.ts
npm run validate:action-contract
npm run test:action-contract
node tests/rateware-stability.test.mjs
node tests/rfx-multilane-e2e.test.mjs
```

- [x] **Step 6: Run the complete repository suite**

```powershell
npm test
git diff --check
rg -n "^(<<<<<<<|=======|>>>>>>>)" . --glob '!node_modules/**' --glob '!tmp/**'
```

Record exact results. Do not classify pre-existing failures as feature passes; compare to Task 0 baseline.

Result: every suite before the frozen P3-V2 closure gate passes. Root `npm test` stops at the same Task 0 baseline: 2/4 P3-V2 closure tests fail because the exact production squash does not satisfy `merge-base --is-ancestor e3e1c0bc0c89d76e4c8d595e4054a749164b2eff HEAD`. Focused Carrier List Templates, Deno type-check, action governance, Rateware stability, Bid Room multi-lane, and preview suites pass independently.

- [x] **Step 7: Commit governance and regression changes**

```powershell
git add supabase/functions/_shared/action-contract.mjs docs/authorization/action-contract.md tests/action-contract.test.mjs package.json
git commit -m "test: govern carrier template actions"
```

### Task 10: Produce non-production browser evidence and release handoff

**Files:**

- Modify: `tools/bid-room-e2e.mjs`
- Create untracked evidence: `tmp/carrier-list-templates-evidence/*`
- Modify if needed: `docs/superpowers/specs/2026-08-25-carrier-list-templates-design.md` status only after review

**Interfaces:**

- Consumes: local/non-production app with release flag enabled, seeded two-organization fixtures, fake communication providers.
- Produces: screenshots/logs proving the approved flow and a no-deploy handoff with migration/function/static release order.

- [ ] **Step 1: Extend browser verification with safe fixtures**

Add a Carrier CRM/Bid Room scenario that:

1. opens `List Templates`;
2. creates a draft from existing CRM carriers;
3. previews matched/ambiguous/not-found/duplicate file rows;
4. manually resolves one ambiguous row;
5. activates, duplicates, archives, and restores with version assertions;
6. opens Carrier Fit and selects the active template;
7. proves the four visible state counts and nonselectable states;
8. selects a subset and clicks the exact CTA;
9. proves Message opens with only newly added carriers;
10. proves Delivery queue still requires explicit preparation/send and no provider call occurred.

- [ ] **Step 2: Add negative tenant and permission probes**

Use direct authenticated test calls/fakes to prove:

- org B cannot list/get org A's template;
- a user without `vendors:manage` can read/use active templates but receives `403` on all five write families;
- a foreign-org UUID rejects the whole save;
- stale `expected_version` returns `409` and preserves both versions;
- archived template disappears from Carrier Fit and a stale open page cannot add it.

- [ ] **Step 3: Run local browser verification with communications disabled**

```powershell
npm run e2e:bid-room
```

Use only the isolated local/non-production environment. Save screenshots and the console/network summary under `tmp/carrier-list-templates-evidence/`; keep it untracked unless the user explicitly requests committed evidence.

- [ ] **Step 4: Perform final verification using the required skill**

Invoke `superpowers:verification-before-completion`. Then run:

```powershell
npm run test:carrier-list-templates
npm run validate:action-contract
npm run test:action-contract
npm test
deno check supabase/functions/rateware-api/index.ts
git diff --check
git status --short
git log --oneline --decorate -12
```

Expected: all feature and regression checks pass, worktree is clean, and no production operation has occurred.

- [ ] **Step 5: Request code review before any release**

Invoke `superpowers:requesting-code-review`. Review specifically for cross-tenant leakage, permission bypass, optimistic concurrency, migration backfill, stable member ordering, missing/deleted carrier visibility, add-to-RFx idempotency, and preservation of the Delivery queue send gate.

- [ ] **Step 6: Prepare—but do not execute—the release order**

Document this later authorized sequence:

```text
1. Apply and verify the Postgres migration in non-production.
2. Deploy rateware-api with CARRIER_LIST_TEMPLATES_V2_ENABLED=false.
3. Deploy static Carrier CRM/Bid Room code.
4. Seed/test a non-production workspace and run the browser/tenant probes.
5. Enable CARRIER_LIST_TEMPLATES_V2_ENABLED in non-production and repeat verification.
6. Obtain explicit production migration/deploy/flag authorization.
7. Apply migration, deploy API/static assets with flag still false, smoke test.
8. Enable the production flag only after the approved smoke window, then monitor audit/errors before declaring the feature available.
```

Stop at the handoff. Approval of this implementation plan is not authorization to push, deploy, migrate, or enable the production flag.

---

## Acceptance Traceability

| Approved acceptance area | Proof task(s) |
|---|---|
| Build only from existing same-workspace CRM carriers | 1, 2, 3, 6, 10 |
| Shared organization workspace and `vendors:manage` writes | 2, 3, 5, 10 |
| CSV/XLSX preview with no carrier creation | 1, 4, 6, 10 |
| Create/edit/duplicate/archive/restore with concurrency | 2, 3, 5, 6, 10 |
| Carrier CRM is the only template editor | 5, 6, 8 |
| Active template loads exact membership in Carrier Fit | 4, 7, 10 |
| Eligible/already/missing/unavailable states are exclusive | 4, 7, 10 |
| Add subset idempotently and open Message | 7, 10 |
| No automatic preparation or send; Delivery queue gate remains | 7, 10 |
| Dynamic segment and existing Bid Room regression safety | 2, 8, 9, 10 |
