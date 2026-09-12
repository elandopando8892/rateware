# P3-A local migration execution — batches 8 and 9

**Candidate branch:** `codex/carrier-list-templates`  
**Candidate SHA before this local-only execution:** `3e087dc12386c68ce70cc38abca79aed06197e0c`  
**Environment:** `rateware-carrier-local-v1`, loopback-only Docker containers

## Scope and safety boundary

This execution used the existing isolated PostgreSQL container only. It did not
contact a hosted Supabase project, Vercel, Google, Gmail, Meta/WhatsApp, or any
production endpoint. The runner only permits its exact local container and
requires the local business tables to be empty before every application.

The pre-existing historical vendor import remains explicitly excluded from this
local environment. It was not executed and is still represented by one
`EXCLUDED_LOCAL_BUSINESS_DATA` ledger record.

## Execution

Docker Engine was healthy and the local container health/binding gate passed.
Each batch was first run as a transaction that rolls back by default, then run
with the explicit `--apply-local-empty` control.

| Batch | Contents | Rollback rehearsal | Local apply | Result |
|---|---:|---|---|---|
| 8 | Six rate-filter RPC/index migrations | PASS | PASS | 47 to 53 ledger entries |
| 9 | Five vendor/BI RPC/index migrations | PASS | PASS | 53 to 58 ledger entries |

The reviewed batch guard rejects DML, permission changes, cron scheduling and
network calls in these two groups. The focused runner suite passed 10/10 after
application.

## Post-application checks

- Container health and loopback bindings: PASS.
- Migration ledger: 58 applied entries; 1 explicit exclusion.
- Local `auth.users`: 0.
- Local `public.vendors`: 0.
- Local `public.rate_staging`: 0.
- Local `public.rfx_events`: 0.
- No carrier record, rate, approval, provider message, invitation, OAuth setting
  or production deployment was created or changed.

## Remaining P3-A gates

This is infrastructure and schema evidence, not authenticated product
acceptance. The next migration after batch 9 begins a 315-migration chain before
`20260825160000_carrier_list_templates.sql`; that chain includes data and
integration changes and must be reviewed in bounded groups before local replay.

P3-A remains open pending that reviewed chain, synthetic two-organization
fixtures, authenticated template permissions, and desktop/mobile journey
evidence. Production remains NO-GO.
