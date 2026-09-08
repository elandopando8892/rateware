# ADR: exact multi-form review basis

Status: candidate policy implemented and tested; transactional activation pending.
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
- [ ] Persist review basis and actor atomically with the state transition.
- [ ] Recheck the same basis in signature, Sales and outbound execution.
- [ ] Real-schema integration, preview and controlled production verification.

No deployment, migration, business-data mutation, signature or outbound action in
this increment. The historical Salzillo case is unchanged. This is not the closure
of multi-form approval in production.
