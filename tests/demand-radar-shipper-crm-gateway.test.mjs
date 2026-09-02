import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEMAND_RADAR_COMMIT_PHRASE,
  normalizeDemandRadarShipperPatch,
  safeDemandRadarShipperProjection,
} from "../supabase/functions/_shared/demand-radar-shipper-crm-contract.mjs";
import { ACTION_CONTRACT } from "../supabase/functions/_shared/action-contract.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const gateway = readFileSync(join(root, "supabase/functions/demand-radar-shipper-crm-gateway/index.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260902120000_demand_radar_shipper_crm_gateway.sql"), "utf8");

assert.equal(DEMAND_RADAR_COMMIT_PHRASE, "ESCRIBIR EN RATEWARE");

const rejected = normalizeDemandRadarShipperPatch({
  shipper_name: "  ACME Chihuahua  ",
  relationship_stage: "unknown",
  primary_contact_email: "private@example.com",
  phone: "+52 614 000 0000",
});
assert.equal(rejected.patch.shipper_name, "ACME Chihuahua");
assert.equal(rejected.patch.relationship_stage, undefined);
assert.ok(rejected.issues.includes("relationship_stage_invalid"));
assert.ok(rejected.issues.includes("contact_field_not_allowed:primary_contact_email"));
assert.ok(rejected.issues.includes("contact_field_not_allowed:phone"));

const safe = safeDemandRadarShipperProjection({
  id: "shipper-1",
  shipper_name: "ACME",
  primary_contact_name: "Persona autorizada",
  primary_contact_email: "must-not-cross@example.com",
  primary_contact_phone: "+52 614 000 0000",
  notes: "must not cross",
  updated_at: "2026-09-02T12:00:00.000Z",
});
assert.equal(safe.shipperName, "ACME");
assert.equal(safe.primaryContactName, "Persona autorizada");
assert.equal("primaryContactEmail" in safe, false);
assert.equal("primaryContactPhone" in safe, false);
assert.equal("notes" in safe, false);

assert.match(gateway, /requireKindeUser\(request\)/);
assert.match(gateway, /resolveWorkspaceUser\(/);
assert.match(gateway, /contact_channels_returned:\s*0/);
assert.doesNotMatch(
  gateway.match(/\.select\("([^"]+)"/)?.[1] || "",
  /primary_contact_email|primary_contact_phone|notes/,
);
assert.match(gateway, /body\.confirmed !== true/);
assert.match(gateway, /if \(!DEMAND_RADAR_WRITES_ENABLED\)/);
assert.match(gateway, /DEMAND_RADAR_WRITES_DISABLED/);
assert.match(gateway, /DEMAND_RADAR_COMMIT_PHRASE/);
assert.match(gateway, /RATEWARE_REVISION_CONFLICT/);

assert.match(migration, /unique \(owner_email, idempotency_key\)/i);
assert.match(migration, /for update;/i);
assert.match(migration, /v_current\.updated_at is distinct from p_expected_revision/i);
assert.match(migration, /canonical_shipper_already_exists/);
assert.match(migration, /grant execute[\s\S]+to service_role;/i);
assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated;/i);
assert.match(migration, /'canonicalValidity', 'first_class_canonical'/);
assert.match(migration, /insert into public\.saas_audit_log/i);

const governed = ACTION_CONTRACT.surfaces.filter((surface) =>
  surface.canonicalId.includes("demand-radar-shipper-crm")
  || surface.canonicalId.includes("apply_demand_radar_shipper_crm_change")
);
assert.equal(governed.length, 4);
assert.equal(governed.find((surface) => surface.actionName === "commit_change")?.decisionStatus, "pending_human_approval");
assert.equal(governed.find((surface) => surface.sourceKind === "postgres-function")?.exposure, "internal/service-role");

console.log("Demand Radar Shipper CRM gateway tests passed.");
