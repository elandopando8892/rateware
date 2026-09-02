import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RATEWARE_PRODUCTION_PROJECT_REF = "alqjqzqagdmcywpjtnnr";
export const DEMAND_RADAR_GATEWAY_PATH = "/functions/v1/demand-radar-shipper-crm-gateway";

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
  const targetIsStaging = Boolean(targetRef && targetRef !== productionRef);
  const endpointMatches = Boolean(targetIsStaging && endpointRef === targetRef);
  const writeFlagsLocked = input.writesEnabled !== true && input.productionWritesAuthorized !== true;
  const gates = [
    gate("target_non_production", targetIsStaging, targetRef === productionRef ? "Production target is forbidden for the Sprint 25 canary." : "A dedicated Rateware staging project ref is required."),
    gate("endpoint_matches_target", endpointMatches, endpointMatches ? "HTTPS gateway URL matches the staging project ref." : "Gateway URL and staging project ref must match exactly."),
    gate("gateway_function_present", input.gatewayFunctionPresent === true, "Gateway function source must be present."),
    gate("migration_present", input.migrationPresent === true, "Gateway migration source must be present."),
    gate("action_contract_present", input.actionContractPresent === true, "Governed action contract entries must be present."),
    gate("writes_locked", writeFlagsLocked, writeFlagsLocked ? "All write flags are off." : "Write flags are forbidden in Sprint 25."),
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
    migrationPresent: existsSync(path.join(root, "supabase/migrations/20260902120000_demand_radar_shipper_crm_gateway.sql")),
    actionContractPresent: existsSync(path.join(root, "supabase/functions/_shared/action-contract.mjs")),
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

