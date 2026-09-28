# Return to Supabase — 2026-09-25

Project `rateware-prod` (`alqjqzqagdmcywpjtnnr`), organization plan **pro**. The
user approved bringing everything back from the September "Supabase-free"
contingency now that the project is on a paid plan.

## What the contingency had moved out (2026-09-06 … 09-08)

| What | Where it went | State found on 2026-09-25 |
|---|---|---|
| BI rate facts (`rateware_bi_rate_facts`, 55,790 rows) | Turso; table truncated, 9 BI RPCs and the table revoked | Pivot, Geo, vendor ranking and the Bid Room benchmark were failing in production (`permission denied`), because rateware-api had since been redeployed without the Turso reader |
| `rate_staging.extracted_payload` of 55,767 approved rates older than 30 days | Turso table `rateware_staging_payload_archive`; PostgreSQL set to `{}` | Only copy in Turso |
| 501 raw upload files (191 MB, uploaded 2026-06-09 … 08-12) | Oracle Object Storage; Supabase copies deleted | Only copy in Oracle; new uploads also went to Oracle (`rawUploadsMode: oracle`) |
| Change capture of rates/vendors | pg_cron `rateware-bi-sync` every 5 min → Turso | Running, nothing read it |

## What was done

1. **BI back in PostgreSQL.**
   - `20260925061821_restore_bi_rate_fact_writers` re-enables the four BI triggers.
   - Backfill of 55,834 facts, one per eligible rate (`pending_review`/`approved`, owner set). It used the exact projection of `rateware_sync_bi_rate_fact`, set-based, in 12 batches.
   - Parity check against the trigger itself on 180 rates (60 without a vendor): identical, except one vendor-stage field. The trigger path had advanced that vendor's lifecycle as a side effect of touching the rate.
   - `20260925062424_restore_bi_readers` restores the original `service_role` grants: the table and 9 functions. anon/authenticated keep no access.
   - Verified as `service_role`:
     - summary returns 1,115 carriers and 55,834 transactions;
     - pivot, geo, vendor metrics, the Bid Room benchmark and `vendor_rate_metrics_for_owner_ids` all return rows.
2. **Turso copy stopped.**
   - Both capture queues were empty at the last run (06:25 UTC), so Turso holds a complete, current backup.
   - `20260925062556_stop_turso_bi_sync` disables the capture triggers and removes the cron job. It is conditional, because those objects exist only in production.
3. **Extracted payloads restored.**
   - The 55,767 archived rows were staged in a temporary table.
   - Their hash matched the 2026-09-07 archive receipt: 55,767 rows, 41,522,143 bytes, SHA-256 `a32d852c6745ba63a8e11ad9ccee4fcddefd3764577d4ea84e514ea3d8d079d8`.
   - They were applied with `session_replication_role = replica`, so no trigger fired, and only where the payload was still `{}` and `updated_at` was unchanged. That held for all 55,767.
   - Recomputing the same hash over `rate_staging` afterwards gives the identical value, so the restore is byte for byte. The staging table was dropped.
4. **Raw upload files back in Supabase Storage.**
   - `RATEWARE_RAW_UPLOAD_STORAGE_MODE=supabase` was set, so new uploads stay in Supabase.
   - Each of the 501 objects was downloaded from Oracle and checked against `raw_uploads.storage_sha256`. It was then written to the same bucket/path in Supabase, read back and checked again. Only then was its row pointed at `supabase`.
   - Result: 501 of 501 copied and verified in 11 batches (199,879,557 bytes, 0 failures). No row is left on `oracle_s3`, and all 501 objects are present in Supabase Storage with matching sizes.
5. **Functions deployed from main.** After #137 merged (a1498367), `rateware-api`, `create-raw-upload`, `interpret-upload` and `rateware-storage-api` were deployed from main. Each smoke-tested: OPTIONS returns 200 with the Rates origin, and POST without a session returns 401. Production now equals main for all four.
6. **Temporary function.** `rateware-supabase-return` ran steps 3–4 inside Supabase, where the Turso and Oracle credentials live, and was deleted afterwards. It was called from SQL through pg_net with the cron secret from Vault. Its source is kept next to this file (`2026-09-25-return-to-supabase.function.ts.txt`).

## Backups kept for 30 days (until 2026-10-25)

- **Turso database:** the BI projection and the payload archive, untouched.
- **Oracle bucket:** the 501 objects, untouched. They are not registered as replicas, so removing an upload in Rateware does not touch them.
- **Private GitHub repo `rateware-contingency-backup`:**
  - the contingency branches;
  - the untracked Sep 8 release candidates;
  - a download of the production functions.

## After 30 days

- Delete the `rateware-bi-sync` function.
- Drop the `rateware_source_sync` and `rateware_bi_sync` schemas and the disabled capture triggers.
- Remove the secrets `RATEWARE_ORACLE_STORAGE_CONFIG`, `RATEWARE_BI_SYNC_*` and `BI_SYNC_*`.
- The account owner closes the Turso and Oracle accounts.
