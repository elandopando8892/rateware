# Demand Radar Shipper CRM gateway · staging runbook

This runbook is intentionally read-only. It does not authorize a production deployment, a live migration, or a Shipper CRM write.

## Preconditions

1. Use the isolated `codex/demand-radar-shipper-crm-gateway` worktree.
2. Select an existing Rateware staging project. Never substitute `rateware-prod` (`alqjqzqagdmcywpjtnnr`).
3. Pin the exact clean commit SHA reviewed for deployment.
4. Keep both write flags off.
5. Obtain explicit authorization immediately before applying the migration to staging.

## Fail-closed preflight

```powershell
$env:RATEWARE_SHIPPER_CRM_TARGET_PROJECT_REF = '<staging-ref>'
$env:RATEWARE_SHIPPER_CRM_GATEWAY_URL = 'https://<staging-ref>.supabase.co/functions/v1/demand-radar-shipper-crm-gateway'
$env:RATEWARE_GATEWAY_EXPECTED_SHA = '<approved-sha>'
node tools/demand-radar-gateway-preflight.mjs
```

The result must have `ok: true`, `mode: read_only_canary`, `externalWrites: 0`, and no blockers. The preflight rejects the production ref, endpoint mismatches, dirty worktrees, SHA drift and enabled write flags.

## Authorized staging sequence

After the staging migration receives explicit authorization:

1. Dry-run the intended migration ledger and confirm only `20260902120000_demand_radar_shipper_crm_gateway.sql` is pending for this scope.
2. Apply that exact migration to the named staging ref.
3. Deploy only `demand-radar-shipper-crm-gateway` to the same staging ref.
4. Configure a workspace-scoped Kinde identity; do not expose its token to the browser.
5. Run `health`, then one paginated `pull_accounts` canary.
6. Retain the response/log evidence that contact channels returned and external writes both equal zero.

Stop on ambiguous deployment state. Reconcile the provider state before retrying.

