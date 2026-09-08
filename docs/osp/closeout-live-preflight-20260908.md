# OSP closeout live preflight — 2026-09-08

Scope: shared Rateware/OSP read-only checks, following exact preview redirect authorization. No business commands were executed.

## Completed

- Reviewed all 13 SQL files in `releases/2026-09-08-closeout-migrations.json` in full. They define commands/guards; they do not invoke signatures, send jobs or fact promotion during application. The first migration changes allowed MIME metadata on the private derived-document bucket.
- Live bucket precondition matches: private, 26,214,400-byte limit, existing PDF/XLSX/DOCX allowlist. Worker and workflow database roles exist.
- Live queried migration ledger has no answer-memory/package-set/semantic-stop/batch entries. No migrations were applied in this check.
- Repository remains on `codex/osp-production-closeout-20260908`, baseline `9a49d72`; unrelated untracked test-results/tmp preserved.

## Production blocker: scheduled intake

Live `osp_private.production_controls` at version 30 reports:

- release mode `shadow`, approval mode `human_approved`, outbound disabled;
- Gmail poll enabled, interval 300 seconds;
- 266 consecutive failures; latest completion `2026-09-08T22:25:01.051329+00:00`;
- classified error `POLL_TOKEN_REFRESH_REJECTED`.

The carriers mailbox connection row still says connected with no last_error, but its last sync completion is `2026-09-08 00:15:02.475+00`. This stale connection flag is not proof of working intake. The handler classification also matches generic bad-request errors; revoked/expired consent is not yet established as the specific root cause. Do not reconnect blindly or run a generic drain: the historical Salzillo queue must remain untouched.

## Remaining release gates

1. Reconcile the classified OAuth failure without exposing credentials or processing historical queued jobs.
2. Complete the coordinated schema/API/UI release, preserving old source backups and verifying current live function revisions before overwriting anything.
3. Demonstrate authenticated read and persistent per-file review on isolated permitted cases. Login alone is not completion.

No signature, mail, webhook, historical Salzillo mutation, fact promotion, function deployment or UI production promotion occurred in this preflight.
