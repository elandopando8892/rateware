# ADR: immutable multi-form generation set

Status: generator and SQL persistence validated locally; runtime integration pending.
Date: 2026-09-08
Decider: product owner requested a versioned set and continued implementation.

## Context

OSP prepares XBF customer registration for a carrier. One request may require
several independent originals. The existing generation run and completed-package
index allow one live file, and Operations exposes one download. Removing the
unique index alone would permit partial replacement and hide files in consumers.

## Decision

Generate a bounded, immutable set under one reviewed input snapshot. Each member
retains its requirement identity, original version/hash, final hash, format and
reviewed mappings. Complete every member before any Storage write. Write each
object exclusively under organization/case/set/source identity. Publish the
complete manifest only after all objects are stored, through one database
transaction that validates the reservation and snapshot. Keep the old set current
until that commit. Reconcile uncertain writes without blindly republishing.

Use the existing XLSX/XLSM, PDF and DOCX completers; do not add infrastructure or
LLM calls. Sorting by source UUID and canonical JSON make manifest identity
independent of input order and jsonb object-key order. Bound each set to 20 members
and 50 MiB combined input/output (existing per-file limits still apply).

## Alternatives

- Remove the current-package index: rejected; unsafe partial publication and
  one-file consumers remain.
- Merge everything into one ZIP: rejected; changes carrier output formats and
  does not solve member-level signature/fulfillment semantics.
- Versioned set plus separate original-format files: chosen; requires updating
  persistence and consumers, but preserves provenance and atomic publication.

## Current implementation and limits

`supplier-package-set.ts` is a generation coordinator with typed object-store
and publisher ports. `supplier-package-set-store.ts` implements reservation,
publication, authoritative reads and reconciliation with real SQL transactions.
`20260908160000_osp_supplier_package_sets.sql` adds the set table, immutable receipt
guard, tenant policies and a worker-only locking helper. The helper locks the
case, source documents and job without granting case UPDATE to the worker. Both
reservation and publication check the latest snapshot, case version, job lease,
approved originals and review-decision membership. A canonical plan hash also
binds values/mappings to the reserved input; modified input cannot reuse a run.

The existing production worker still uses the single-file path. No multi-file
capability is being advertised as deployed or complete. The reviewed-source
resolver must supply trusted input to this internal adapter; it is not an API
accepting arbitrary browser or LLM mappings.

Tests create real synthetic XLSX/PDF/DOCX bytes and reopen generated files. Storage
is a double; the persistence integration executes the actual migration and SQL
with osp_worker/osp_workflow_api roles in PGlite, using a reduced parent schema.
This is not a live Supabase or multi-session concurrency test. Generation is not proof of semantic
completeness, valid signature, approval or permission to send. PDF/DOCX appendix
fallbacks retain the existing semantic stop; no coverage percentage is inferred.

## Required closure work

- [x] Implement generation coordinator and failure/reconciliation test cases.
- [x] Obtain passing typed tests for the generator and persistence candidate.
- [x] Implement reservation and atomic publication plus additive migration (not applied remotely).
- [ ] Resolve all reviewed sources independently (no global format fallback).
- [ ] Connect worker; retain authoritative idempotency across retries.
- [ ] List and download every member in Operations, without selecting an arbitrary
  first member for signature or treating it as the entire set.
- [x] Integration test rollback, tenant boundary, immutable receipts, expired
  leases, revoked source approval and stale snapshots; single-file regression.
- [ ] Validate multi-session concurrency and the full deployed schema.
- [ ] Refresh scoped action fingerprints and complete release verification.

No migration, production deployment, business data change, signature or outgoing
communication has occurred in this increment.

## Earlier interrupted validation (preserved evidence)

`deno fmt` completed for both new TypeScript files. Focused `deno lint` initially
reported require-await in the Storage double; it was corrected and the rerun
passed (2 files). `git diff --check` passed. The existing job file was restored
to its exact prior content; only three new files remain in the worktree.

Two typed, frozen, cached-only test attempts reached the Check stage without
returning test outcomes. They were interrupted rather than represented as PASS.
The first included the existing single-package regression; the second isolated
the new set suite. No no-check run was substituted. The environment reported
Deno 2.9.4 / TypeScript 6.0.3. The cause of the stalled check is not established.
That attempt remained uncommitted and was not presented as a verified release.

## Recovered validation and persistence increment

The original 12 tests passed with type checking on re-execution in 4.35 seconds;
the earlier stall did not recur, and no cause is claimed. While adding persistence,
type checking identified two untyped callbacks after Array.isArray narrowing;
explicit callback types corrected both. No no-check execution was used.

The release suite covers 21 tests and 10 integration steps: 12 set-generation
tests, one actual-SQL test with ten steps, two existing single-file generation
tests and six source-replacement regression tests. The test injects a database
failure between old-set retirement and new-set activation; PostgreSQL rolls back
the retirement, retains all previously stored bytes and holds the uncertain run.
Published receipt edits, mismatched tenants, stale/same-version-old snapshots,
expired leases and modified plans are rejected. Source approvals are rechecked.

The action contract passes 168/168 without changing any existing fingerprint or
introducing an exposed action. This does not certify the new helper for production.
Only the private OSP repository is a permitted publication target for this work.
The next increment is the worker source resolver and Operations file list; the
point "multiple forms in the live package" is not yet closed.
