#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { SUPABASE_URL } from "../src/config.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCTION_HOSTS = new Set([
  "rates.heymarksman.com",
  "rateware.vercel.app",
]);

export function isKnownProductionApiUrl(apiUrl, productionApiUrl = SUPABASE_URL) {
  let candidate;
  let production;
  try {
    candidate = new URL(apiUrl);
    production = new URL(productionApiUrl);
  } catch {
    return true;
  }
  if (PRODUCTION_HOSTS.has(candidate.hostname.toLowerCase())) return true;
  return candidate.hostname.toLowerCase() === production.hostname.toLowerCase();
}

function requiredValue(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`Remote probe configuration requires ${name}.`);
  return value;
}

export function buildRemoteProbeConfig(env = process.env) {
  const apiUrl = requiredValue(env, "RATEWARE_NONPROD_API_URL").replace(/\/$/, "");
  if (isKnownProductionApiUrl(apiUrl)) {
    throw new Error("Remote probe configuration points at the known production API.");
  }
  if (!/^https:\/\/[^/]+\/functions\/v1\/rateware-api$/i.test(apiUrl)) {
    throw new Error("RATEWARE_NONPROD_API_URL must be an HTTPS Supabase rateware-api endpoint.");
  }
  return Object.freeze({
    apiUrl,
    orgAToken: requiredValue(env, "RATEWARE_NONPROD_ORG_A_TOKEN"),
    orgBToken: requiredValue(env, "RATEWARE_NONPROD_ORG_B_TOKEN"),
    readOnlyToken: requiredValue(env, "RATEWARE_NONPROD_READONLY_TOKEN"),
    templateId: (() => {
      const value = requiredValue(env, "RATEWARE_NONPROD_TEMPLATE_ID");
      if (!UUID_PATTERN.test(value)) throw new Error("RATEWARE_NONPROD_TEMPLATE_ID must be a valid UUID.");
      return value;
    })(),
  });
}

function safeError(error) {
  return String(error instanceof Error ? error.message : error || "Unknown error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

async function callRateware(fetchImpl, config, token, action, payload = {}) {
  const response = await fetchImpl(config.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  return { status: response.status, body };
}

function assertResponse(result, expectedStatus, message) {
  if (result.status !== expectedStatus) {
    throw new Error(`${message}: expected HTTP ${expectedStatus}, received HTTP ${result.status}.`);
  }
  return result.body || {};
}

function finish(report) {
  report.verdict = report.checks.every((check) => check.status === "pass" || check.status === "skip") ? "GO" : "NO_GO";
  return report;
}

async function check(report, name, run) {
  try {
    const details = await run();
    report.checks.push({ name, status: "pass", ...(details || {}) });
    return details || {};
  } catch (error) {
    report.checks.push({ name, status: "fail", error: safeError(error) });
    return null;
  }
}

export async function runRemoteCarrierTemplateProbes({
  config,
  fetchImpl = globalThis.fetch,
  productionApiUrl = SUPABASE_URL,
  now = () => new Date().toISOString(),
} = {}) {
  if (!config || typeof config !== "object") throw new Error("Remote probe config is required.");
  if (isKnownProductionApiUrl(config.apiUrl, productionApiUrl)) {
    throw new Error("Remote probe configuration points at the known production API.");
  }
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  const report = {
    schema_version: 1,
    environment: "remote-non-production",
    external_effects: "none",
    api_host: new URL(config.apiUrl).host,
    template_id: config.templateId,
    generated_at: now(),
    checks: [],
    verdict: "NO_GO",
  };

  const seeded = await check(report, "org_a_can_list_and_get_seeded_template", async () => {
    const list = await callRateware(fetchImpl, config, config.orgAToken, "list_carrier_list_templates", {
      lifecycle_status: "active",
      limit: 200,
    });
    const listBody = assertResponse(list, 200, "org A template list");
    const rows = Array.isArray(listBody.rows) ? listBody.rows : [];
    const row = rows.find((candidate) => String(candidate?.id || "") === config.templateId);
    if (!row) throw new Error("Seeded template was not visible to organization A.");
    const get = await callRateware(fetchImpl, config, config.orgAToken, "get_carrier_list_template", {
      id: config.templateId,
    });
    const getBody = assertResponse(get, 200, "org A template read");
    if (String(getBody.row?.id || "") !== config.templateId) throw new Error("Seeded template read returned a different id.");
    const version = Number(getBody.row?.template_version || row.template_version || 0);
    if (!Number.isInteger(version) || version < 1) throw new Error("Seeded template did not return a valid template_version.");
    return { template_version: version, member_count: Array.isArray(getBody.row?.vendor_ids) ? getBody.row.vendor_ids.length : null };
  });
  if (!seeded) return finish(report);

  await check(report, "org_b_cannot_list_org_a_template", async () => {
    const result = await callRateware(fetchImpl, config, config.orgBToken, "list_carrier_list_templates", {
      lifecycle_status: "active",
      limit: 200,
    });
    const body = assertResponse(result, 200, "org B template list");
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.some((row) => String(row?.id || "") === config.templateId)) {
      throw new Error("Organization B received organization A's template id.");
    }
    return { visible_rows: rows.length };
  });

  await check(report, "org_b_cannot_get_org_a_template", async () => {
    const result = await callRateware(fetchImpl, config, config.orgBToken, "get_carrier_list_template", {
      id: config.templateId,
    });
    assertResponse(result, 404, "org B template read");
    return { status_code: result.status };
  });

  await check(report, "read_only_user_cannot_update_template", async () => {
    const result = await callRateware(fetchImpl, config, config.readOnlyToken, "update_carrier_list_template", {
      id: config.templateId,
    });
    const body = assertResponse(result, 403, "read-only template update");
    if (!/vendors:manage/i.test(String(body.error || ""))) throw new Error("Read-only update did not identify the missing manage permission.");
    return { status_code: result.status };
  });

  if (seeded.template_version < 2) {
    report.checks.push({
      name: "stale_expected_version_returns_409",
      status: "skip",
      reason: "Seeded template must be at version 2 or greater for a non-mutating stale-version probe.",
    });
    return finish(report);
  }

  await check(report, "stale_expected_version_returns_409", async () => {
    const result = await callRateware(fetchImpl, config, config.orgAToken, "update_carrier_list_template", {
      id: config.templateId,
      expected_version: seeded.template_version - 1,
    });
    const body = assertResponse(result, 409, "stale template update");
    if (body.code !== "template_version_conflict") throw new Error("Stale update did not return template_version_conflict.");
    if (Number(body.current_version) !== seeded.template_version) throw new Error("Stale update did not preserve the current version.");
    return { status_code: result.status, current_version: Number(body.current_version) };
  });

  return finish(report);
}

function printHelp() {
  console.log(`
Remote Carrier List Templates probes (non-production only)

Required environment variables:
  RATEWARE_NONPROD_API_URL=https://<non-prod-project>.supabase.co/functions/v1/rateware-api
  RATEWARE_NONPROD_ORG_A_TOKEN=<Supabase access token for workspace A>
  RATEWARE_NONPROD_ORG_B_TOKEN=<Supabase access token for workspace B>
  RATEWARE_NONPROD_READONLY_TOKEN=<Supabase access token without vendors:manage>
  RATEWARE_NONPROD_TEMPLATE_ID=<active seeded template UUID in workspace A>

The runner rejects the known production API and performs no business writes,
messages, invitations, or carrier changes. The read-only update and stale-version
checks are expected to stop at authorization/version guards (403/409).
`);
}

export async function writeRemoteProbeReport(report, root = resolve(import.meta.dirname, "..")) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidenceDirectory = resolve(root, "tmp", "carrier-list-templates-evidence", timestamp);
  mkdirSync(evidenceDirectory, { recursive: true });
  const reportPath = resolve(evidenceDirectory, "remote-tenant-probes.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  let report;
  try {
    const config = buildRemoteProbeConfig();
    report = await runRemoteCarrierTemplateProbes({ config });
  } catch (error) {
    report = {
      schema_version: 1,
      environment: "remote-non-production",
      external_effects: "none",
      verdict: "NO_GO",
      checks: [{ name: "configuration", status: "fail", error: safeError(error) }],
    };
  }
  const reportPath = await writeRemoteProbeReport(report);
  console.log(`Remote carrier template probes: ${report.verdict}`);
  console.log(`Evidence: ${reportPath}`);
  if (report.verdict !== "GO") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
