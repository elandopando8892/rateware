# Open correction amendment — candidate, not deployed

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
