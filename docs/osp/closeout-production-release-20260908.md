# OSP coordinated release — 2026-09-08

## Executed

- All 13 reviewed, hash-matched migrations applied to shared Rateware/OSP. Receipts: `releases/2026-09-08-closeout-applied.json`. Remote ledger uses application-time versions 20260908223138 through 20260908223153 and preserves original filenames in names. Do not run db push to reconcile these timestamps automatically.
- SQL baseline (definitions, grants, constraints, bucket metadata) preserved in ignored `tmp/osp-release-backup-b8fc6fb/sql-baseline.json` before application.
- Promoted production-environment UI `dpl_CuDr3KniMaKSvENf9RcdXszdW8kA` (b8fc6fb). Verified `osp.heymarksman.com` resolves to that deployment. Previous rollback target: `dpl_Ggf4PYD79X66rfFLipw3kNuj5Fhe`.
- Published osp-case-api (183) and osp-document-api (164). Initial read/form bundling failed because the server bundler did not resolve root Zod imports. Failure did not replace those two functions.
- Added per-function pinned Zod import maps and regression test in 10ae07b; both entrypoint type checks and regression test passed. Re-deployed only osp-read-api and osp-form-api successfully. Private branch pushed through 10ae07b; public origin untouched.
- No worker deployment or invocation, no signatures, outgoing emails, fact promotion or historical Salzillo writes.

## Authenticated production evidence

Fresh Google login as sales@heymarksman.com returned OSP ADMINISTRATOR on `/app/pipeline`. The rendered UI showed five real cases, including historical Salzillo (SENT) and Crane (RECEIVED). `/app/documents` rendered four corporate document categories. This proves authenticated UI reads, not completeness of those documents for carrier-specific age requirements or package review persistence. Member-review count remains zero.

## Gmail reconnection safety gate

User confirmed availability to reconnect carriers. Existing connection is XBFMX, legal entity 8ee24d78-9c59-4354-97ab-0a9ff3b39fff. Opened shared Rateware Provider Gmail UI authenticated as Sales; no Connect/Sync/Watch action clicked.

Before reconnecting, the OSP polling cron must be paused so token recovery cannot drain historical work. Exact job: 3, `osp-gmail-poll-every-5-minutes`. Attempt to use cron.alter_job returned permission denied (42501). Read-back confirms job 3 remains active; job 2 documentary check remains active. Do not claim paused or continue reconnection until an authorized operator pauses it. No workaround permission grants made.

The OSP Gmail panel incorrectly describes missing Pub/Sub as the blocker despite the installed cron; this UI diagnosis needs correction. A connected row is not health proof. Full closure remains unproven.
