# Rateware P3-B release and rollback runbook

**Status:** prepared, not yet exercised in an isolated non-production runtime  
**Scope:** `rates.heymarksman.com`, Vercel frontend, Supabase `rateware-api`,
Supabase migrations and the Carrier List Templates feature flag  
**Safety boundary:** read-only checks are executable by the agent; promotion,
flag changes, migrations, rollback and external communications require the
named human release owner.

## Release record before any change

Capture the exact candidate SHA, Vercel deployment ID and alias, deployed Edge
Function version, migration ledger head, feature-flag state, and the current
Action Contract report. Record `request_id` and `operation_id` for every
authenticated probe. Do not paste bearer tokens or secret values into the
record.

Required preconditions:

1. P3-A local runtime is healthy and the migration set has passed rollback
   probe plus empty-local apply.
2. P3-B permissions, cross-organization denial, stale-version rejection and
   idempotent replay have a timestamped report.
3. P4 has a GO on an isolated deployed non-production workspace pair.
4. The templates flag is OFF in production until the authenticated smoke
   passes.

## Read-only release checks

- `node tools/validate-action-contract.mjs` must report zero errors.
- Confirm `GET /auth/v1/health` and the Rateware public health endpoint return
  success from the intended environment.
- Confirm the signed-in user resolves to the expected organization and that a
  second test identity cannot list, load or materialize the first
  organization's template.
- Confirm Carrier CRM lists only CRM carriers, Carrier Fit lists only active
  templates, and Message shows an explicit audience without sending.
- Confirm intake remains source-preserving and staged in `rate_staging`; no
  approval, invitation, email, WhatsApp, award or RateBook production write is
  part of this check.

## Rollback triggers

The release owner must stop and evaluate rollback if any of these occurs:

- any cross-tenant read or write;
- any unauthorized template mutation or stale-version overwrite;
- any unexpected production insert/update, invitation, message or award;
- authenticated Google sign-in or tenant resolution fails for a valid user;
- a critical Carrier Fit → Message handoff cannot be reproduced;
- sustained 5xx rate above 1% for five minutes, or P95 latency above 2 seconds
  for five minutes, once those baselines are measured in P3-B;
- migration, function or flag state differs from the release record.

Until a measured baseline is attached, the thresholds above are release
proposals, not evidence of healthy production behavior.

## Rollback order (human-confirmed)

1. Freeze the feature flag and stop further release actions; do not send or
   queue communications.
2. If the frontend is the fault, restore the previously approved Vercel
   deployment/alias and verify the exact deployment ID.
3. If the Edge Function is the fault, redeploy the previously approved function
   version and verify its health endpoint and Action Contract surface.
4. If a migration is the fault, execute only its reviewed reverse migration or
   forward-fix under the database owner’s approval. Never drop audit, source,
   RFx, participant, template or RateBook evidence as an ad-hoc rollback.
5. Re-run the read-only checks above, compare request/operation receipts, and
   record the final state before considering recovery complete.

## Evidence still required to close P3-B

- one controlled rollback drill for frontend, Edge Function and database;
- measured 4xx/5xx, latency, tenant-resolution and unexpected-write queries;
- an independent review tied to the exact candidate SHA;
- named release and rollback owners and a human GO.

No rollback, flag change, migration, production deployment or external message
was executed while preparing this runbook.
