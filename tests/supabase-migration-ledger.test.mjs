import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const productionOnlyMigrations = new Map([
  [
    "20260815071846_grant_provider_document_processor_service_role.sql",
    "ac4d4da865f08ee792c614017aab2376f45c01b3c723e8159bbc6c35793bbf8e",
  ],
  [
    "20260817052654_provider_neutral_inbox_persistence.sql",
    "81b2c67c5e58f22cafeb5ccaa034755e7149ba38541c784f9aa5f6158c068bc7",
  ],
  [
    "20260817090000_provider_entity_vault_workspace.sql",
    "061215219fc65c5be0371d47280d50894f1ae4f91b60651dfd78aa1259667778",
  ],
  [
    "20260817100000_provider_onboarding_operator_read_models.sql",
    "14ca69aad8200306c45e9f85dee97cf4d8466282007a62c5488e9ebdad0d2d3d",
  ],
  [
    "20260817110000_provider_onboarding_approval_commands.sql",
    "8faabce7af35b213eebdeb4c528e304f6367de22e57dd7dfc6dccf70fd38826b",
  ],
  [
    "20260817120000_provider_onboarding_approval_revision_scope.sql",
    "d0a8e233a8ea9655f2c077037c3bb37caa1e4c7d0d71e7112a51713fe83c5954",
  ],
  [
    "20260817130000_provider_onboarding_signature_template_binding.sql",
    "a3f72476ad1a06fb7747c2ed87362032270d1fc088ab945c1c843b273b647289",
  ],
  [
    "20260817140000_provider_agent_model_assisted_runtime.sql",
    "1ceec1bacd3a230925f30ace471346bab472d3be72fc9762eac0bb6dbdfca9f0",
  ],
  [
    "20260818090000_provider_onboarding_service_role_runtime_grants.sql",
    "3fcd62332cd8f805d439ec1824c245bec71ab81f6fb81805233e241c43032b90",
  ],
  [
    "20260818091000_provider_onboarding_identity_read_grants.sql",
    "8e12d713b988ebead94a54a800a09e63681b5921008a2a0ded145d647f305329",
  ],
  [
    "20260819090000_provider_entity_operator_attested_scan.sql",
    "8a238e5a26a025eaabfe28b6e08da79b35dcf920eef3f6394be739d291124a15",
  ],
  [
    "20260819100000_provider_entity_review_seeding_grants.sql",
    "69c85008405f1c968ea056f3b97777ce4f1fc098dd195fe07da057279c330432",
  ],
  [
    "20260819213354_provider_onboarding_requirement_waivers.sql",
    "16f4a2dc5b0c147e704e78087207e1da5a29278238b54720771dc354e1436a1f",
  ],
  [
    "20260819214744_provider_release_item_hash_check_null_safe.sql",
    "5d23adae368ab3b90137ed75a92b0188e046e539df4152307823fda332a8e33a",
  ],
  [
    "20260819220858_provider_onboarding_single_admin_approval.sql",
    "020bc7c55c73d995d1618169ec48ecaf3dbd27cad0a970f55e143d0dbea4e5cb",
  ],
  [
    "20260819221154_provider_release_approval_separation_allows_flagged_self.sql",
    "c5e596f63845ea1ecd8f39f7347c3e4c88f088c88350377ca916de94075e24e2",
  ],
  [
    "20260819221616_provider_release_approval_sets_expiry.sql",
    "c9c797c19013f0267162700ba946fd3432afe893164e65f9efd99850082be053",
  ],
  [
    "20260819223635_provider_mailbox_policy_domain_shape.sql",
    "791bdcb53aa234cd8ba6a3a85478e4afe46923618b65e1560fd50d7d5db66129",
  ],
  [
    "20260819223726_provider_mailbox_policy_enabled_domains_cardinality.sql",
    "230749edfa2aeecb66ba4ef60fb2e8422fbbc2eda54ff0dfe9697d182730d381",
  ],
  [
    "20260819224030_provider_mailbox_domain_predicate_execution_hardening.sql",
    "87a067759ac1676deb26cf6a89d95ace874200f193c1009ea62ce0a2db4239f7",
  ],
  [
    "20260820043613_provider_onboarding_redacting_transforms.sql",
    "8549b19151339f4427d38a7d39cd6063046393af9e5574389a5fb99dc38d1283",
  ],
  [
    "20260821010652_provider_read_model_service_role_grants.sql",
    "4c254d4ccc7d0a4191d86c0ed642c72166b606f50ef5c8a8aa7909700d4398a4",
  ],
  [
    "20260821010804_provider_read_model_service_role_grants_chain.sql",
    "801cba7aab69626581f409f13f7d9625be076fa1ca4ea7031e216b7e2c80c584",
  ],
  [
    "20260821011805_provider_command_service_role_grants.sql",
    "96b7645fff01ad6c0a2030a1b72516e7efecbaf0a730a8d5b71e78f0f9ecc762",
  ],
  [
    "20260825160000_carrier_list_templates.sql",
    "7cc3bf0787e428c6ceaf18facb3319e5e8fdd737f46a26d60036149e28e0527c",
  ],
]);

function migrationHash(contents) {
  const normalized = contents.toString("utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

test("migration hashes ignore checkout line-ending conversion", () => {
  assert.equal(
    migrationHash(Buffer.from("select 1;\n")),
    migrationHash(Buffer.from("select 1;\r\n")),
  );
});

test("production migration history remains reproducible from tracked SQL files", () => {
  const missing = [];
  const empty = [];
  const changed = [];

  for (const [filename, expectedHash] of productionOnlyMigrations) {
    const migrationPath = path.join(
      repoRoot,
      "supabase",
      "migrations",
      filename,
    );
    try {
      const contents = readFileSync(migrationPath);
      if (!contents.toString("utf8").trim()) empty.push(filename);
      const actualHash = migrationHash(contents);
      if (actualHash !== expectedHash) changed.push(filename);
    } catch (error) {
      if (error?.code === "ENOENT") missing.push(filename);
      else throw error;
    }
  }

  assert.deepEqual(
    missing,
    [],
    `missing production migrations:\n${missing.join("\n")}`,
  );
  assert.deepEqual(
    empty,
    [],
    `empty production migrations:\n${empty.join("\n")}`,
  );
  assert.deepEqual(
    changed,
    [],
    `changed production migrations:\n${changed.join("\n")}`,
  );
});

test("clean replay CI verifies pinned hashes, final ledger, and Provider Service grants", () => {
  const workflow = readFileSync(
    path.join(repoRoot, ".github", "workflows", "clean-migration-replay.yml"),
    "utf8",
  );

  assert.match(workflow, /run:\s+npm run test:migration-ledger/);
  assert.match(workflow, /tests\/supabase-migration-ledger\.test\.mjs/);
  assert.match(workflow, /count\(\*\).*max\(version\)/s);
  assert.match(workflow, /373\|20260831031500/);
  assert.match(workflow, /provider_legal_entity_fact_promotions/);
  assert.match(workflow, /provider_onboarding_readiness_evaluations/);
  assert.match(workflow, /provider_onboarding_readiness_results/);
  assert.match(workflow, /provider_onboarding_release_package_approvals/);
  assert.match(workflow, /t\|t\|t\|t\|t/);
});
