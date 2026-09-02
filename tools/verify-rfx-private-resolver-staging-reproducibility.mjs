import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [raw, migration, generator, evidenceQuery, fixture] = await Promise.all([
  read("docs/rfx-private-resolver-staging-reproducibility.json"),
  read("supabase/migrations/20260617150000_import_sourcing_base_google_sheet.sql"),
  read("tools/generate-vendor-sheet-migration.mjs"),
  read("supabase/staging/marksman-loads-private-resolver-evidence.sql"),
  read("supabase/staging/marksman-loads-private-resolver-fixture.sql"),
]);
const receipt = JSON.parse(raw);

assert.equal(receipt.contractVersion, "rateware.private-resolver.staging-reproducibility.v1");
assert.equal(receipt.canaryVersion, "beta-10.3");
assert.equal(receipt.authorization.productionAuthorized, false);
assert.equal(receipt.authorization.realBusinessEffectsAuthorized, false);
assert.deepEqual(receipt.migrationRepair.replacementArbiter, ["vendor_name", "domain"]);
assert.equal(receipt.migrationRepair.disposablePostgresReplay, "PASSED");
assert.equal(receipt.migrationRepair.fullLocalMigrationReset, "PASSED");
assert.match(migration, /on conflict \(vendor_name, domain\) do update/i);
assert.match(generator, /on conflict \(vendor_name, domain\) do update/i);

assert.equal(receipt.automaticProof.status, "MIGRATIONS_PASSED");
assert.equal(receipt.automaticProof.deletedAfterProof, true);
assert.equal(receipt.target.branchName, "marksman-loads-staging");
assert.equal(receipt.target.gitBranch, "codex/marksman-loads-private-resolver-10-3");
assert.equal(receipt.target.persistent, true);
assert.equal(receipt.target.withProductionData, false);
assert.equal(receipt.target.automaticMigrationPath, "PASSED");
execFileSync("git", ["merge-base", "--is-ancestor", receipt.target.sourceSha, "HEAD"], { cwd:root, stdio:"ignore" });

assert.equal(receipt.credentialRotation.fixtureOnlyPredecessorDeleted, true);
assert.equal(receipt.credentialRotation.replacementUsesFreshBranchCredentials, true);
assert.equal(receipt.credentialRotation.credentialMaterialRecorded, false);
assert.equal(receipt.databaseEvidence.migrationCount, 69);
assert.equal(receipt.databaseEvidence.sourceVendorRows, 1269);
assert.equal(receipt.databaseEvidence.fixtureVendorRows, 1);
assert.equal(receipt.databaseEvidence.ledgerRows, 1);
assert.equal(receipt.databaseEvidence.bidRows, 0);
assert.equal(receipt.databaseEvidence.requestBodyColumns, 0);
assert.deepEqual(receipt.isolation.retainedFunctions, ["rfx-private-resolver"]);
assert.equal(receipt.isolation.inheritedFunctionsRemoved, 34);

assert.equal(receipt.canary.status, "PASSED");
assert.equal(receipt.canary.persistedReplay, "PASSED");
assert.equal(receipt.canary.tampering, "BLOCKED");
assert.equal(receipt.canary.liveExecution, "BLOCKED");
assert.equal(receipt.canary.finalCanaryState, "DISABLED");
assert.equal(receipt.openControls.networkRestrictionState, "UNRESTRICTED");
assert.equal(receipt.openControls.monitoringOwnerAssigned, false);
assert.equal(receipt.decision.productionReady, false);
assert.ok(Object.values(receipt.businessEffects).every((value) => value === false));

assert.match(evidenceQuery, /source_vendor_rows/i);
assert.match(evidenceQuery, /bid_rate is not null/i);
assert.match(fixture, /Never apply this file to production/i);
assert.doesNotMatch(raw + migration + generator + evidenceQuery + fixture, /eyJ[A-Za-z0-9_-]{40,}/);
assert.doesNotMatch(raw + migration + generator + evidenceQuery + fixture, /postgres(?:ql)?:\/\/[^\s]+@/i);

console.log(JSON.stringify({
  status:"PASS",
  version:receipt.canaryVersion,
  automaticMigrations:"passed",
  target:{name:receipt.target.branchName, ref:receipt.target.branchProjectRef, persistent:true, withProductionData:false},
  evidence:{migrations:69, sourceVendors:1269, fixtureVendors:1, ledgerRows:1, bids:0},
  canary:{replay:"passed", tampering:"blocked", liveExecution:"blocked", finalState:"disabled"},
  openControls:["NETWORK_RESTRICTIONS_NOT_NARROWED", "MONITORING_OWNER_NOT_ASSIGNED"],
  productionApproved:false,
  externalBusinessEffects:false,
}, null, 2));
