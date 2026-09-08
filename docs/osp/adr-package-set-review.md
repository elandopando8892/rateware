# ADR: exact multi-form review basis

Status: policy and transactional persistence adapter tested locally; production source loader and activation pending.
Date: 2026-09-08
Decider: product owner requested continuation of the multi-form package workflow.

## Context

Generating every file does not establish that every carrier requirement is met.
Existing approvals and signature jobs identify a single generated package. A new
set must not reuse an old single-file signature or a generic case-level approval.
OSP remains XBF customer registration, using the existing Rateware/OSP database.

## Decision

Prepare one canonical review basis binding organization, case/version, input
snapshot hash, request-contract hash, set identity/version/manifest hash and every
member's source identity, output bytes, requirement identity, persisted review
decision and signature policy/version. Input order does not change the digest.
Missing/extra/duplicate members, unresolved reviews, unverified completeness and
changed hashes stop preparation. Autograph remains distinct from image signature.
Preparing the basis does not approve anything or prove an autograph exists.

The internal policy accepts trusted inputs only. It has no HTTP route and is not
yet invoked by the approval command. The next adapter must load authoritative
decisions under the same database lock as current set/case checks and persist the
exact basis with actor and idempotency evidence before advancing Operations.
Do not expose completenessVerified as an authority-bearing browser checkbox.

## Options and consequences

- Approve first file: rejected; omits independent originals.
- Approve only set UUID: rejected; does not bind request/review/policy revisions.
- Bind complete canonical basis: selected; explicit stale-review detection, but
  requires an additive transactional approval path and set-wide signature jobs.

The workflow projection now suppresses all downstream capabilities when a set is
present, including draft/freeze/Sales/send capabilities formerly derived from a
legacy signed file. This is a projection safeguard, not a new database permission
or a substitute for endpoint enforcement. Existing semantic guards remain intact.

## Evidence and remaining work

51 typed tests pass: 14 review-basis cases, 13 workflow-view cases, 7 existing
multi-form semantic regressions, 8 Operations/signature regressions and 9 set-reader
tests. Lint passes for the new policy/tests. An initial
typecheck failed to narrow a possibly absent map lookup through an inferred arrow
helper; an explicit never-returning function fixed it, without disabling checks.

- [x] Exact review-basis policy and adversarial unit tests.
- [x] Prevent legacy signed-file capabilities for a current multi-form set.
- [x] Implement and locally test atomic review-basis/actor persistence with the existing transition.
- [ ] Implement authoritative per-output review loading and production command wiring.
- [ ] Recheck the same basis in signature, Sales and outbound execution.
- [ ] Real-schema integration, preview and controlled production verification.

No deployment, migration, business-data mutation, signature or outbound action in
this increment. The historical Salzillo case is unchanged. This is not the closure
of multi-form approval in production.

## Transactional persistence increment

`package-set-review-store.ts` uses one tenant transaction for an advisory
idempotency lock, exact receipt replay, trusted locked-context loading, review
digest verification, the existing `complete_operations_review_command`, and
the immutable review receipt. Failed persistence rolls back both the existing
case transition and its audit event. Replay checks current actor authority but
does not re-approve or reload mutable evidence. Changed commands conflict.

The additive migration `20260908180000_osp_package_set_operations_reviews.sql`
adds an append-only tenant receipt ledger with set/case identity constraints.
It grants only select/insert to the existing workflow role; neither workers nor
browser roles receive access. It creates no job and does not activate a route.
The role remains a trusted server boundary, not a permission exposed to a user.

The source loader is intentionally required and has no production implementation
yet: existing mapping decisions do not prove final-output completeness. The caller
must obtain persisted per-output decisions and semantic assessment under the same
transaction locks. Supplying browser booleans or simply relabeling mapping approval
as final-file approval is prohibited. No UI capability is enabled by this adapter.

Validation: 21 typed tests including six PostgreSQL integration steps. PGlite
executes the actual new migration and the existing Operations command definition
against a reduced parent schema. The actor and snapshot helper dependencies and
locked decision loader are explicit test seams, not full deployed-schema proof.
The real TypeScript actor policy is exercised. Tests cover rollback after transition,
stale/rejected evidence, unauthorized identity, immutable receipts, exact replay,
tenant read/write denial and the 256-character idempotency boundary. Existing
approval-store regressions remain passing. No multi-session concurrency claim.

Initial failed probes are retained in task output: two unknown-row TypeScript
errors, a noncanonical synthetic session timestamp, then PostgreSQL rejecting a
`{1,256}` regex quantifier. Explicit row typing, a canonical timestamp and separate
length/character validation fixed them without disabling checks or weakening policy.
