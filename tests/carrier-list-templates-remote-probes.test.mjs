import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRemoteProbeConfig,
  isKnownProductionApiUrl,
  runRemoteCarrierTemplateProbes,
} from "../tools/carrier-list-templates-remote-probes.mjs";

const STAGING_API_URL = "https://rateware-staging-example.supabase.co/functions/v1/rateware-api";
const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE = {
  id: TEMPLATE_ID,
  segment_name: "Staging Northeast Dry Van",
  lifecycle_status: "active",
  status: "active",
  template_version: 2,
  vendor_ids: ["22222222-2222-4222-8222-222222222222"],
};

function config(overrides = {}) {
  return buildRemoteProbeConfig({
    RATEWARE_NONPROD_API_URL: STAGING_API_URL,
    RATEWARE_NONPROD_ORG_A_TOKEN: "org-a-token",
    RATEWARE_NONPROD_ORG_B_TOKEN: "org-b-token",
    RATEWARE_NONPROD_READONLY_TOKEN: "readonly-token",
    RATEWARE_NONPROD_TEMPLATE_ID: TEMPLATE_ID,
    ...overrides,
  });
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("remote probe configuration rejects the known production API", () => {
  assert.equal(isKnownProductionApiUrl("https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/rateware-api"), true);
  assert.equal(isKnownProductionApiUrl("https://rates.heymarksman.com/functions/v1/rateware-api"), true);
  assert.equal(isKnownProductionApiUrl(STAGING_API_URL), false);
  assert.throws(
    () => buildRemoteProbeConfig({
      RATEWARE_NONPROD_API_URL: "https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/rateware-api",
      RATEWARE_NONPROD_ORG_A_TOKEN: "a",
      RATEWARE_NONPROD_ORG_B_TOKEN: "b",
      RATEWARE_NONPROD_READONLY_TOKEN: "r",
      RATEWARE_NONPROD_TEMPLATE_ID: TEMPLATE_ID,
    }),
    /known production API/
  );
});

test("remote probes certify cross-tenant reads, read-only writes, and stale version rejection", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const token = init.headers.Authorization.replace(/^Bearer\s+/i, "");
    calls.push({ url, token, action: body.action });

    if (token === "org-a-token" && body.action === "list_carrier_list_templates") {
      return response(200, { rows: [TEMPLATE], total: 1 });
    }
    if (token === "org-a-token" && body.action === "get_carrier_list_template") {
      return response(200, { row: TEMPLATE });
    }
    if (token === "org-b-token" && body.action === "list_carrier_list_templates") {
      return response(200, { rows: [], total: 0 });
    }
    if (token === "org-b-token" && body.action === "get_carrier_list_template") {
      return response(404, { error: "Carrier list template was not found." });
    }
    if (token === "readonly-token" && body.action === "update_carrier_list_template") {
      return response(403, { error: "Missing required permission: vendors:manage" });
    }
    if (token === "org-a-token" && body.action === "update_carrier_list_template") {
      return response(409, {
        code: "template_version_conflict",
        current_version: TEMPLATE.template_version,
      });
    }
    throw new Error(`Unexpected remote probe call: ${token}:${body.action}`);
  };

  const report = await runRemoteCarrierTemplateProbes({
    config: config(),
    fetchImpl: fakeFetch,
    productionApiUrl: "https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/rateware-api",
    now: () => "2026-09-08T02:00:00.000Z",
  });

  assert.equal(report.verdict, "GO");
  assert.deepEqual(
    report.checks.map((check) => [check.name, check.status]),
    [
      ["org_a_can_list_and_get_seeded_template", "pass"],
      ["org_b_cannot_list_org_a_template", "pass"],
      ["org_b_cannot_get_org_a_template", "pass"],
      ["read_only_user_cannot_update_template", "pass"],
      ["stale_expected_version_returns_409", "pass"],
    ],
  );
  assert.deepEqual(calls.map((call) => call.action), [
    "list_carrier_list_templates",
    "get_carrier_list_template",
    "list_carrier_list_templates",
    "get_carrier_list_template",
    "update_carrier_list_template",
    "update_carrier_list_template",
  ]);
});

test("remote probe configuration requires explicit fixture credentials", () => {
  assert.throws(
    () => buildRemoteProbeConfig({ RATEWARE_NONPROD_API_URL: STAGING_API_URL }),
    /requires RATEWARE_NONPROD_ORG_A_TOKEN/
  );
});
