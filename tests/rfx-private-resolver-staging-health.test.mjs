import assert from "node:assert/strict";
import test from "node:test";

import { checkStagingHealth } from "../tools/check-rfx-private-resolver-staging-health.mjs";

const env = {
  MARKSMAN_STAGING_SUPABASE_URL: "https://staging.invalid",
  RATEWARE_SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
};

const ok = {
  get_rfx_private_resolver_ledger_health: {
    processingCurrent: 0, processingExpired: 0, completed24h: 1, failed24h: 0,
    checkedAt: "2026-09-02T02:30:00.000Z", requestBodyStored: false,
    credentialMaterialStored: false, externalExecutionPossible: false,
  },
  get_rfx_private_resolver_operational_readiness: {
    controlVersion: "rfx-private-resolver-controls.v1", rateLimitEnabled: true,
    rateLimitPerMinute: 30, requests24h: 1, denied24h: 0,
    secretCustodyVerified: true, networkControlsVerified: true,
    monitoringOwnerAssigned: true, rollbackRehearsed: true,
    productionApproved: false, releaseReady: false, requestBodyStored: false,
    credentialMaterialStored: false, externalExecutionPossible: false,
  },
};

const fetchFor = (overrides = {}) => async (url) => {
  const name = String(url).split("/").at(-1);
  return { ok:true, status:200, json:async () => ({ ...ok[name], ...(overrides[name] || {}) }) };
};

test("accepts aggregate-only closed-pilot staging health", async () => {
  const result = await checkStagingHealth({ env, fetchImpl:fetchFor() });
  assert.equal(result.status, "PASS_CLOSED_PILOT_STAGING");
  assert.equal(result.controls.productionApproved, false);
  assert.equal(result.externalExecutionPossible, false);
});

test("fails closed on expired work, failures, or false production readiness", async () => {
  await assert.rejects(() => checkStagingHealth({ env, fetchImpl:fetchFor({ get_rfx_private_resolver_ledger_health:{ processingExpired:1 } }) }), /expired/);
  await assert.rejects(() => checkStagingHealth({ env, fetchImpl:fetchFor({ get_rfx_private_resolver_ledger_health:{ failed24h:1 } }) }), /failures/);
  await assert.rejects(() => checkStagingHealth({ env, fetchImpl:fetchFor({ get_rfx_private_resolver_operational_readiness:{ releaseReady:true, productionApproved:true } }) }));
});

test("fails closed when sensitive material or external execution appears", async () => {
  await assert.rejects(() => checkStagingHealth({ env, fetchImpl:fetchFor({ get_rfx_private_resolver_ledger_health:{ requestBodyStored:true } }) }));
  await assert.rejects(() => checkStagingHealth({ env, fetchImpl:fetchFor({ get_rfx_private_resolver_operational_readiness:{ externalExecutionPossible:true } }) }));
});
