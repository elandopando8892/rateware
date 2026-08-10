# Backend Action Contract

## Purpose and scope

Phase 0.1 records every governable backend surface in a canonical, versioned contract. It detects additions, removals, renames, duplicate IDs, incompatible permission metadata and source/classification drift without connecting to Supabase, Kinde or any other service.

This contract **does not perform authorization enforcement**. It is not imported by the application, frontend or Edge runtime, does not change `full-access`, and is not a security certification.

## Sources and discovery

The validator reads the repository as text:

- literal Edge action selectors after `Deno.serve`;
- delegated Growth action cases;
- fixed HTTP-method operations declared by the inventory method;
- unique schema-qualified PostgreSQL function names declared by migrations.

`OPTIONS`, helper functions and the `typeof body.action === "string"` type guard are excluded. PostgreSQL overloads are governed by stable schema-qualified name in 0.1; signature-level grants remain a later database verification concern.

`supabase/functions/whatsapp-healthcheck` is recorded separately as a non-governable, unreachable declaration because it has no `index.ts`. It is not counted among the 349 surfaces.

## Canonical IDs

- Edge selector or method: `edge.<edge-function>.<stable-action-name>`
- PostgreSQL function: `rpc.<schema>.<function-name>`
- Non-governable declaration: `declaration.edge.<directory-name>`

IDs never contain line numbers, array positions or source hashes. Reformatting, comments and file order do not change identity. A source fingerprint is separate from the ID and forces deliberate review when implementation changes.

## Lifecycle

- `active`: current governable surface.
- `alias`: current compatibility name pointing to `replacementAction`.
- `deprecated`: still present but scheduled for retirement.
- `unreachable`: declared but not callable.
- `removed`: intentionally absent and retained as history.

Rename: add the new ID, retain the old ID as `alias` or `deprecated`, set `replacementAction`, and document compatibility.

Split: add each new ID; deprecate the old ID and document all replacements in notes. Merge: add/identify the merged ID and deprecate each old ID. Removal: change lifecycle to `removed` before deleting the source and retain the disposition. New action: run the validator, add metadata with `pending_human_approval`, and obtain owner review before any future enforcement.

Changes from public to authenticated, read to write, tenant-scoped to platform-scoped, or internal to externally exposed require a deliberate contract diff, security/business review and refreshed source fingerprint. They are never inferred as permission grants.

## Decision statuses

- `explicitly_allowed`: the reviewed contract recognizes an existing scoped public/token/state/signature flow. It does not grant runtime access.
- `explicitly_denied`: reserved for a reviewed surface that must not be enabled.
- `pending_human_approval`: classification exists, but permission/owner decisions are not approved. The 256 pending surfaces remain pending.
- `internal_only`: service-role/internal surface; never a human permission.

## Workflow

Add or change an action:

1. change the real source;
2. run `npm run validate:action-contract` and observe the blocking difference;
3. add or update the contract entry without changing its ID unless identity truly changed;
4. set new human-facing decisions to `pending_human_approval`;
5. review exposure, read/write, tenant relevance, sensitivity, permission and owner;
6. run `npm run test:action-contract` and the affected static tests;
7. review the contract diff and evidence.

Resolve differences by classifying them as real code change, methodology difference, alias, duplicate, non-governable surface, new surface, false positive or not determinable. Do not manipulate counts to match a baseline.

## Validation levels

Errors block: unregistered or missing active surfaces, duplicate IDs, invalid metadata/status, missing source/handler, invalid/circular aliases, incompatible permission reuse, unreviewed exposure/source/fingerprint changes, write without sensitivity and service-role exposure contradictions.

Warnings require review but do not fail. Informational findings document non-governable declarations. Output is sorted and excludes notes or source contents so it does not reproduce secrets.

## Relationship to later increments

0.2–0.10 may consume the contract only after separate authorization and human decisions. 0.1 introduces no tenant model, memberships, persistent roles/permissions, RLS, shadow mode, pilot or enforcement. Process ownership remains `PENDING HUMAN APPROVAL`.
