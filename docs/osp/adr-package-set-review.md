# ADR: exact multi-form review basis

Status: policy, persistence and authoritative SQL source connected and tested locally; human-review UI/API activation pending.
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
- [x] Implement authoritative per-output review loading as the persistence adapter default.
- [ ] Connect authenticated human-review capture and the UI command boundary.
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

At that checkpoint the source loader was an explicit test seam: existing mapping
decisions do not prove final-output completeness. The following increment supplies
the SQL implementation. No UI capability is enabled by the adapter itself.

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

## Authoritative final-output review source

`20260908190000_osp_package_set_member_reviews.sql` adds append-only human decisions
over exact output hashes, scoped to the current set and request manifest. Approval
records full-output inspection, reviewed completion percentage and page count;
these are explicit human attestations, not LLM self-certification or occupied-cell
heuristics. A SQL trigger checks actor authority, locks the case, verifies the
current member/output identity and enforces sequential review versions. No browser
or worker role receives access. There is no backfill from mapping decisions.

`loadLockedPackageSetReview` is now the default source of the transactional adapter.
It locks the case/current set, relevant sources and review records in the same
transaction; verifies the latest resolved contract, approved original/hash/snapshot
membership and newest per-output decisions; and binds each form through its unique
source citation. It reuses the existing corporate-document evidence evaluator for
formats and validity, and the existing pre-signature semantic gate for completeness.
Autograph and image policies remain distinct; no signature is inferred or applied.

The PostgreSQL integration now exercises the actual new migrations, locking helper,
review trigger, default SQL loader, semantic evaluation and atomic store together.
The parent schema is still reduced and the pre-existing actor/snapshot SQL helper
dependencies are test stubs; this is not a deployed-schema or multi-session test.
Eight steps cover rollback, missing reviews, rejected source, unresolved contract,
stale case version, incomplete output, missing corporate evidence, successful
two-file review, replay, immutable receipts and tenant isolation. Negative probes
that insert newer incomplete reviews are rolled back rather than deleting evidence.
The combined typed regression run passes 70 tests and eight integration steps;
lint and all 168 action-contract checks pass. Only the 12 case-API dependency
fingerprints changed; no new HTTP action or permission is exposed.

Pending: authenticated per-output review capture in the API/UI, deployed-schema
and concurrency verification, then explicit set-wide signature/Sales/send consumers.
The new adapter is not wired to an HTTP action and all set-wide UI capabilities
remain disabled. No migration has been applied remotely and no historical case
has been modified. Production readiness remains an estimate, not a test percentage.

## Download identity correction before review capture

Runtime composition previously forced `XBF-OSP-Supplier-Package.xlsx` for every
signed Storage download, including PDF/DOCX set members. The view now supplies a
source-UUID-based name with the verified MIME extension for each member, and
composition forwards it to Storage. The legacy single-XLSX name stays unchanged.
No browser-provided path/name is accepted. This fixes inspection prerequisites;
it does not implement the pending review-capture UI or activate any approval.
Focused validation: 27 tests (name/format, workflow projection and composition)
plus lint. No new route, permission, migration or deployment in this correction.

## Internal inspection command (not yet exposed)

Decision: separate saving a member inspection from completing Operations. Reuse
the existing tenant transaction, fresh actor policy and database insert guard;
do not introduce a second approval workflow or allow browser table writes.
`createPackageMemberReviewStore.save` records the inspected output hash, set,
request, completion/page attestations and signature requirement. It checks the
current case version and exact latest input snapshot before writing. Approval of
an inspection does not mean that the whole request is fulfilled: the existing
set-wide semantic evaluator remains responsible for that later decision.

The additive `20260908200000_osp_member_review_command_identity.sql` stores a
command digest. Existing evidence remains immutable with a null digest, so it
cannot accidentally be claimed as an idempotent application replay. The caller
retains a UUID for a retry; identical authenticated commands replay the receipt,
while a changed decision or actor/session conflicts. A fresh authentication after
an uncertain response therefore requires read reconciliation, not silent retry
with another UUID. Review versions are assigned under the existing case lock.

Rejected alternatives: writing directly from the UI (untrusted authority),
reusing mapping approvals (not final-output inspection), and advancing the case
on every member save (would skip package-wide completeness checks).

Integration uses the real writer instead of seeding the two human reviews with
raw inserts. It verifies invalid attestations, stale case/output, unauthorized
actors, exact replay, changed-command conflict and no case transition/events.
The earlier reduced-schema and SQL-authority-stub limitations still apply.
No HTTP route, UI control or runtime import activates this writer yet. Next:
authenticated route, persisted review projection, per-file UI and browser proof;
then deployed-schema validation. No remote migration or business action performed.
