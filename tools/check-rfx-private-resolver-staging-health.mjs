import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const required = (name, env = process.env) => {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function rpc(url, serviceRoleKey, name, fetchImpl) {
  const response = await fetchImpl(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  return body;
}

export async function checkStagingHealth({ env = process.env, fetchImpl = fetch } = {}) {
  const url = required("MARKSMAN_STAGING_SUPABASE_URL", env);
  const serviceRoleKey = required("RATEWARE_SUPABASE_SERVICE_ROLE_KEY", env);
  const [ledger, readiness] = await Promise.all([
    rpc(url, serviceRoleKey, "get_rfx_private_resolver_ledger_health", fetchImpl),
    rpc(url, serviceRoleKey, "get_rfx_private_resolver_operational_readiness", fetchImpl),
  ]);

  assert.equal(Number(ledger.processingExpired), 0, "expired resolver claims require rollback");
  assert.equal(Number(ledger.failed24h), 0, "resolver failures require review");
  assert.equal(ledger.requestBodyStored, false);
  assert.equal(ledger.credentialMaterialStored, false);
  assert.equal(ledger.externalExecutionPossible, false);

  assert.equal(readiness.controlVersion, "rfx-private-resolver-controls.v1");
  assert.equal(readiness.rateLimitEnabled, true);
  assert.equal(readiness.secretCustodyVerified, true);
  assert.equal(readiness.networkControlsVerified, true);
  assert.equal(readiness.monitoringOwnerAssigned, true);
  assert.equal(readiness.rollbackRehearsed, true);
  assert.equal(readiness.productionApproved, false);
  assert.equal(readiness.releaseReady, false);
  assert.equal(readiness.requestBodyStored, false);
  assert.equal(readiness.credentialMaterialStored, false);
  assert.equal(readiness.externalExecutionPossible, false);

  return {
    status: "PASS_CLOSED_PILOT_STAGING",
    checkedAt: ledger.checkedAt,
    ledger: {
      processingCurrent: Number(ledger.processingCurrent),
      processingExpired: Number(ledger.processingExpired),
      completed24h: Number(ledger.completed24h),
      failed24h: Number(ledger.failed24h),
    },
    rateLimit: {
      enabled: true,
      limitPerMinute: Number(readiness.rateLimitPerMinute),
      requests24h: Number(readiness.requests24h),
      denied24h: Number(readiness.denied24h),
    },
    controls: {
      secretCustody: "VERIFIED_STAGING",
      network: "RESTRICTED_CURRENT_OPERATOR_HOST",
      monitoringOwnerRole: "AUTHORIZED_MARKSMAN_LOADS_ADMIN",
      rollback: "REHEARSED",
      productionApproved: false,
    },
    sensitivePayloadStored: false,
    externalExecutionPossible: false,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await checkStagingHealth(), null, 2));
}
