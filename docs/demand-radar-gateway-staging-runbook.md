# Demand Radar Shipper CRM gateway · zero-additional-cost read canary

This runbook is intentionally read-only. It does not authorize a production deployment, a live migration, or a Shipper CRM write.

## Preconditions

1. Use the isolated `codex/demand-radar-gateway-current` worktree based on the current `origin/main`.
2. Do not create a third Supabase project. Technical staging runs locally on D:.
3. The only live target permitted is the existing `rateware-prod` (`alqjqzqagdmcywpjtnnr`) and only for an explicitly authorized read canary. `marksman-erp` is out of scope.
4. Pin the exact clean commit SHA reviewed for deployment.
5. Keep the Rateware gateway and both Demand Radar write flags off.
6. No database migration is required or authorized for the first read-only canary.

## Fail-closed preflight

```powershell
$env:RATEWARE_SHIPPER_CRM_TARGET_PROJECT_REF = 'alqjqzqagdmcywpjtnnr'
$env:RATEWARE_SHIPPER_CRM_GATEWAY_URL = 'https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/demand-radar-shipper-crm-gateway'
$env:RATEWARE_SHIPPER_CRM_PRODUCTION_READS_AUTHORIZED = 'true'
$env:DEMAND_RADAR_SHIPPER_CRM_WRITES_ENABLED = 'false'
$env:RATEWARE_GATEWAY_EXPECTED_SHA = '<approved-sha>'
node tools/demand-radar-gateway-preflight.mjs
```

The result must have `ok: true`, `mode: read_only_canary`, `newCloudProjects: 0`, `additionalFixedMonthlyCostUsd: 0`, `externalWrites: 0`, and no blockers. The preflight rejects any project other than the existing Rateware target, endpoint mismatches, missing read authorization, dirty worktrees, SHA drift and enabled write flags.

## Authorized live-read sequence

After the production read canary receives explicit authorization:

1. Confirm the deployed source keeps `DEMAND_RADAR_SHIPPER_CRM_WRITES_ENABLED=false` and reports `capabilities.commit=false`.
2. Deploy only `demand-radar-shipper-crm-gateway` to the existing Rateware project; do not apply the write-receipt migration.
3. Use the signed-in operator's Supabase Auth session and resolve the canonical Rateware workspace server-side; never expose the service-role credential to the browser.
4. Run `health`, then one paginated `pull_accounts` canary.
5. Retain the response/log evidence that contact channels returned and external writes both equal zero.

Stop on ambiguous deployment state. Reconcile the provider state before retrying.
