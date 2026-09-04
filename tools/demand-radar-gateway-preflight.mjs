import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RATEWARE_PRODUCTION_PROJECT_REF = "alqjqzqagdmcywpjtnnr";
export const DEMAND_RADAR_GATEWAY_PATH = "/functions/v1/demand-radar-shipper-crm-gateway";
export const DEMAND_RADAR_ACTION_CONTRACT_PATH = "supabase/functions/_shared/action-contract-demand-radar-gateway.mjs";

function clean(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function endpointProjectRef(value) {
  try {
    const url = new URL(clean(value, 1_000));
    const match = url.hostname.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/);
    if (url.protocol !== "https:" || url.pathname !== DEMAND_RADAR_GATEWAY_PATH) return "";
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function gate(id, ok, detail) {
  return { id, status: ok ? "pass" : "blocked", detail };
}

export function evaluateDemandRadarGatewayPreflight(input = {}) {
  const productionRef = clean(input.productionProjectRef || RATEWARE_PRODUCTION_PROJECT_REF, 80).toLowerCase();
  const targetRef = clean(input.targetProjectRef, 80).toLowerCase();
  const endpointRef = endpointProjectRef(input.endpoint);
  const targetIsExistingRateware = Boolean(targetRef && targetRef === productionRef);
  const endpointMatches = Boolean(targetIsExistingRateware && endpointRef === targetRef);
  const productionReadAuthorized = input.productionReadsAuthorized === true;
  const writeFlagsLocked = input.gatewayWritesEnabled !== true && input.writesEnabled !== true && input.productionWritesAuthorized !== true;
  const gates = [
    gate("existing_rateware_only", targetIsExistingRateware, targetRef && targetRef !== productionRef ? "Third hosted projects and marksman-erp are forbidden." : "The existing rateware-prod project ref is required."),
    gate("endpoint_matches_target", endpointMatches, endpointMatches ? "HTTPS gateway URL matches the existing Rateware project ref." : "Gateway URL must match rateware-prod exactly."),
    gate("production_read_authorized", productionReadAuthorized, "A separate explicit authorization is required for the production read canary."),
    gate("gateway_function_present", input.gatewayFunctionPresent === true, "Gateway function source must be present."),
    gate("action_contract_present", input.actionContractPresent === true, "Governed action contract entries must be present."),
    gate("writes_locked", writeFlagsLocked, writeFlagsLocked ? "Gateway and Demand Radar write flags are off." : "Every write flag is forbidden in the read-only canary."),
    gate("exact_sha", input.expectedSha ? input.expectedSha === input.actualSha : true, input.expectedSha ? "Actual SHA must match the approved SHA." : "No release SHA was supplied; pin one before deployment."),
    gate("clean_worktree", input.workingTreeClean === true, "Deployment must start from a clean isolated worktree."),
  ];
  const blockers = gates.filter((item) => item.status === "blocked");
  return {
    ok: blockers.length === 0,
    mode: "read_only_canary",
    targetRef,
    productionRef,
    endpointRef,
    externalWrites: 0,
    newCloudProjects: 0,
    additionalFixedMonthlyCostUsd: 0,
    gates,
    blockers: blockers.map((item) => item.id),
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function git(args) {
  return clean(execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }), 10_000);
}

function currentPreflight() {
  const root = process.cwd();
  return evaluateDemandRadarGatewayPreflight({
    targetProjectRef: arg("--target-ref") || process.env.RATEWARE_SHIPPER_CRM_TARGET_PROJECT_REF,
    endpoint: arg("--endpoint") || process.env.RATEWARE_SHIPPER_CRM_GATEWAY_URL,
    expectedSha: arg("--expected-sha") || process.env.RATEWARE_GATEWAY_EXPECTED_SHA,
    actualSha: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    gatewayFunctionPresent: existsSync(path.join(root, "supabase/functions/demand-radar-shipper-crm-gateway/index.ts")),
    actionContractPresent: existsSync(path.join(root, DEMAND_RADAR_ACTION_CONTRACT_PATH)),
    productionReadsAuthorized: /^(1|true)$/i.test(clean(process.env.RATEWARE_SHIPPER_CRM_PRODUCTION_READS_AUTHORIZED, 20)),
    gatewayWritesEnabled: /^(1|true)$/i.test(clean(process.env.DEMAND_RADAR_SHIPPER_CRM_WRITES_ENABLED, 20)),
    writesEnabled: /^(1|true)$/i.test(clean(process.env.RATEWARE_SHIPPER_CRM_WRITES_ENABLED, 20)),
    productionWritesAuthorized: /^(1|true)$/i.test(clean(process.env.RATEWARE_SHIPPER_CRM_PRODUCTION_WRITES_AUTHORIZED, 20)),
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = currentPreflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
