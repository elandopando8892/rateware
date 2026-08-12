import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeCatalogSyncPlan } from "../supabase/functions/_shared/catalog-sync-plan.mjs";
import { serviceFromNormalizedText } from "../supabase/functions/_shared/service-normalization.mjs";

assert.equal(serviceFromNormalizedText("One Way per rule: single price without RT marker"), "One Way");
assert.equal(serviceFromNormalizedText("no explicit Round Trip marker; use One Way"), "One Way");
assert.equal(serviceFromNormalizedText("RT marker visible"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted; no RT surcharge"), "Roundtrip");
assert.equal(serviceFromNormalizedText("RT marker visible; no RT accessorial"), "Roundtrip");
assert.equal(serviceFromNormalizedText("RT marker visible; One Way note says without RT marker"), "Roundtrip");
assert.equal(serviceFromNormalizedText("One Way; without RT surcharge"), "One Way");
assert.equal(serviceFromNormalizedText("One Way; without RT accessorial"), "One Way");
assert.equal(serviceFromNormalizedText("Backhaul"), "Backhaul");

const operations = [
  { table: "a", rows: [{ id: 1 }], onConflict: "id" },
  { table: "b", rows: [{ id: 2 }], onConflict: "id", enabled: false },
  { table: "c", rows: [{ id: 3 }], onConflict: "id" }
];
const writes = [];
const preview = await executeCatalogSyncPlan({ dryRun: true, operations, upsert: async (...args) => writes.push(args) });
assert.deepEqual(preview, { tables_written: 0, operations_planned: 2 });
assert.equal(writes.length, 0, "dry-run must never call an upsert");

const applied = await executeCatalogSyncPlan({ dryRun: false, operations, upsert: async (...args) => writes.push(args) });
assert.deepEqual(applied, { tables_written: 2, operations_planned: 2 });
assert.deepEqual(writes.map(([table]) => table), ["a", "c"]);

const catalogServiceSource = readFileSync(new URL("../src/catalog-service.js", import.meta.url), "utf8");
const catalogWorkbenchSource = readFileSync(new URL("../src/catalog-workbench.js", import.meta.url), "utf8");
assert.match(catalogServiceSource, /dry_run: dryRun/, "Catalog preview must send dry_run explicitly");
assert.match(catalogWorkbenchSource, /async function previewCatalogSync\(\)[\s\S]+dryRun: true/, "Catalog UI must expose a non-writing preview action");
assert.match(catalogWorkbenchSource, /No rows were written/, "Catalog preview must state its non-writing result");

console.log("Phase 0.2 shadow hardening tests passed.");
