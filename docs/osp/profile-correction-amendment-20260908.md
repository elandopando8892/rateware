# Open correction amendment — authenticated recovery verified

Purpose: recover an incorrectly serialized reviewer value through the existing
authenticated field-decision workflow, rather than directly rewriting data or
inventing another ingestion of the same document.

The existing command permits `corrected -> corrected` only while the review is
in_review, at the expected revision, owned by the same actor who decided that
field. Accepted, rejected, withheld and closed decisions are not reopened.
Restricted fields remain blocked. Every amendment appends the previous value,
note, actor and time, and the new decision, to the existing event ledger in the
same transaction. It does not approve the document or publish any fact.

The UI exposes correction entry and renewed source confirmation for an open
correction, without offering accept/reject transitions for that decided field.

Local evidence: PGlite regression passed; four UI tests passed; TypeScript
check passed. The SQL test covers stale revision, wrong owner, forbidden
transition, exact before/after values, duplicate stale attempt, closed review,
restricted field, changed original reviewer, and no extra revision/event after
rejected attempts. These do not prove native PostgreSQL migration compatibility
or recovered production data.

Native PostgreSQL 17.11 rehearsal passed in synthetic database
`osp_correction_rehearsal_run_2`: exact values/history, event constraints and
unchanged function ACL after replacement. The first native run exposed the old
JSON binding in the test adapter; that failed run remains preserved in run_1.
The adapter now uses the deployed `::text::jsonb` binding. PGlite rerun passed.
The local server was stopped afterward. Remote read-only preflight confirms
the old command body and ACL `{postgres=X/postgres,osp_workflow_api=X/postgres}`.

Next release gates: deployment compatibility, exact migration publication,
authenticated preview amendment and read-back of value/history. Do not execute
the production amendment before those gates pass. The real review remains
revision 3 with the original failure preserved. No historical Salzillo changes.

Shared database migration applied as remote version `20260908231607`, name
`20260908233000_osp_profile_correction_amendment`. Post-publication SQL confirms
both guards/history payload and unchanged ACL; the target review remains r3.
No command or business-data write was executed by the migration. Rollback is
the previous function body in `20260828202820_osp_profile_evidence_human_review.sql`,
restored through a new recorded migration; do not delete amendment events.
Native rehearsal test commit: `09627d9`.
Preview build dispatched: `dpl_Gc1Nuau29tbLkWisyHQY1RhyNbrZ` from an app-only
git archive of that commit, existing project and authorized preview origin.

## Authenticated recovery

The preview reached READY and the existing closeout alias was reassigned to it.
Using Sales' authenticated UI, selected XBFUS / Legal name / Mc Authority,
entered the exact source-backed value with a repair note and confirmed original
inspection. Clicked Save verified correction exactly once. The UI confirmed
the audit event and explicitly no fact promotion.

Production read-back: review `cb9fd68d-ea0d-44eb-889d-f8807335142c` is in_review
revision 4; legal_name equals JSON string `XBFREIGHT SYSTEMS LLC` exactly;
amendment_count is 1; the event retains both the formerly double-encoded value
and the exact new value. No direct SQL repair, finalization, fact promotion,
signature, email, webhook or historical Salzillo mutation occurred.

The other two review fields remain pending. The UI still displays a placeholder
under Proposed value, not the persisted correction; do not use that placeholder
as evidence of lost data. Read-back above proves persistence. Broader profile,
case-package and production UI release gates remain open.
