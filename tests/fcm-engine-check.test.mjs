import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TIERS } from "../supabase/functions/quotedesk-api/fcm.mjs";
import {
  engineCheck,
  FORMULA_FILES,
  formulaCheck,
  KNOWN_PARAM_KEYS,
  replaySnapshot,
  snapshotOutput,
  unknownParams
} from "../supabase/functions/sync-fcm-bases/engine-check.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/fcm-engine-golden.json", import.meta.url), "utf8"));

/** A calculation as the FCM saves it (quote-snapshot.ts), from a golden scenario the FCM engine produced. */
function fcmSnapshot(scenario, overrides = {}) {
  const { compatibilityMode, ...input } = scenario.input;
  return {
    format: "fcm.calculation-snapshot.v1",
    engineVersion: compatibilityMode === "LEGACY_FCM_V3" ? "fcm-v3" : "fcm-v3.1-profiled",
    input: { policy: scenario.output.policy, ...input },
    output: snapshotOutput(scenario.output),
    checksum: "not-checked",
    ...overrides
  };
}

const sameFormula = formulaCheck("3414f95f5ec377d077b5f0b876a993b63c581cb0", { ...FORMULA_FILES });
const base = (params, usable = true) => ({ owner_email: "org:one", name: "FTL Intra-México Estándar", usable, params });

test("the copy knows every parameter it reads", () => {
  const source = readFileSync(new URL("../supabase/functions/quotedesk-api/fcm.mjs", import.meta.url), "utf8");
  const read = [...source.matchAll(/(?:getParam|P)\(\s*[\w.]+\s*,\s*"([A-Z_]+)"\s*,\s*"([^"]+)"/g)].map((m) => `${m[1]}__${m[2]}`);
  read.push(...Object.values(TIERS).map((tier) => `TECHNICAL_MARGIN__${tier.field}`));
  assert.ok(read.length > 100);
  assert.deepEqual(read.filter((key) => !KNOWN_PARAM_KEYS.has(key)), []);
});

test("a parameter the copy doesn't know is flagged for its workspace only, on usable bases", () => {
  assert.deepEqual(unknownParams({ "FUEL__Diesel MX": 26.7, "VEHICLE__Rabon Capital": 90000 }), ["VEHICLE__Rabon Capital"]);
  const flagged = engineCheck({ bases: [base({ "VEHICLE__Rabon Capital": 90000 })], formula: sameFormula, checkedAt: "t" });
  // The engine itself is fine; only that workspace's base needs review, and its reason stays with it.
  assert.equal(flagged.status, "ok");
  assert.deepEqual(flagged.reasons, []);
  assert.equal(flagged.unknown_params.length, 1);
  assert.equal(flagged.unknown_params[0].owner_email, "org:one");
  assert.match(flagged.unknown_params[0].reason, /no sabe usar: VEHICLE · Rabon Capital/);
  const draft = engineCheck({ bases: [base({ "VEHICLE__Rabon Capital": 90000 }, false)], formula: sameFormula, checkedAt: "t" });
  assert.deepEqual(draft.unknown_params, []);
});

test("the FCM's own calculations replay the same through the copy", () => {
  for (const scenario of golden.scenarios) {
    assert.deepEqual(replaySnapshot(fcmSnapshot(scenario)), { outcome: "same" }, scenario.name);
  }
  const snapshots = golden.scenarios.map((scenario, index) => ({ id: `q${index}`, created_at: "t", snapshot: fcmSnapshot(scenario) }));
  const check = engineCheck({ bases: [], formula: { read: "unavailable", release: null, changed: [] }, snapshots, checkedAt: "t" });
  assert.equal(check.status, "ok");
  assert.equal(check.replay.same, golden.scenarios.length);
});

test("a calculation that no longer matches puts estimates in review", () => {
  const scenario = golden.scenarios[0];
  const snapshot = fcmSnapshot(scenario);
  snapshot.output = { ...snapshot.output, requiredTariffUsd: snapshot.output.requiredTariffUsd + 100 };
  const replay = replaySnapshot(snapshot);
  assert.equal(replay.outcome, "different");
  assert.deepEqual(replay.differences.map((item) => item.field), ["requiredTariffUsd"]);
  const check = engineCheck({ bases: [], formula: sameFormula, snapshots: [{ id: "q1", created_at: "t", snapshot }], checkedAt: "t" });
  assert.equal(check.status, "review");
  assert.match(check.reasons.join(" "), /1 de 1 cálculos recientes del FCM no dan lo mismo/);
});

test("a new engine version or snapshot format is a change; drayage is skipped", () => {
  const scenario = golden.scenarios[0];
  assert.deepEqual(replaySnapshot(fcmSnapshot(scenario, { engineVersion: "fcm-v4" })), { outcome: "new_engine", engine_version: "fcm-v4" });
  assert.equal(replaySnapshot(fcmSnapshot(scenario, { format: "fcm.calculation-snapshot.v2" })).outcome, "new_format");
  assert.equal(replaySnapshot(null).outcome, "new_format");
  const drayage = fcmSnapshot(scenario);
  drayage.input = { ...drayage.input, drayageLeg: { miles: 30 } };
  assert.equal(replaySnapshot(drayage).outcome, "skipped");
  const check = engineCheck({
    bases: [],
    formula: sameFormula,
    snapshots: [{ id: "q1", created_at: "t", snapshot: fcmSnapshot(scenario, { engineVersion: "fcm-v4" }) }],
    checkedAt: "t"
  });
  assert.equal(check.status, "review");
  assert.match(check.reasons.join(" "), /otra versión de su fórmula \(fcm-v4\)/);
});

test("the formula check compares the live release's files with the ported ones", () => {
  assert.deepEqual(sameFormula.changed, []);
  const hashes = { ...FORMULA_FILES, "engine.mex.ts": "0".repeat(64) };
  const changed = formulaCheck("abcdef1234", hashes);
  assert.deepEqual(changed, { read: "ok", release: "abcdef1234", changed: ["engine.mex.ts"], hashes });
  // The kept hashes are compared again with FORMULA_FILES as they are, so refreshing them clears the review.
  assert.deepEqual(formulaCheck(changed.release, { ...FORMULA_FILES }).changed, []);
  const moved = formulaCheck("abcdef1234", { ...FORMULA_FILES, "engine.usa.ts": null });
  assert.deepEqual(moved.changed, ["engine.usa.ts"]);
  const unpublished = formulaCheck("abcdef1234", Object.fromEntries(Object.keys(FORMULA_FILES).map((file) => [file, null])));
  assert.equal(unpublished.read, "not_published");

  const review = engineCheck({ bases: [], formula: changed, checkedAt: "t" });
  assert.equal(review.status, "review");
  assert.match(review.reasons[0], /publicó cambios en su fórmula \(versión abcdef1: mex\)/);
  assert.match(engineCheck({ bases: [], formula: unpublished, checkedAt: "t" }).reasons[0], /No se pudo leer en GitHub/);
});

test("a replay that couldn't be read keeps its Postgres code and is not a change", () => {
  const check = engineCheck({ bases: [], formula: sameFormula, snapshotsRead: "error", snapshotsError: "22023", checkedAt: "t" });
  assert.equal(check.status, "ok");
  assert.equal(check.replay.read, "error");
  assert.equal(check.replay.error_code, "22023");
});

test("nothing to compare against is unverified, not ok", () => {
  const unavailable = engineCheck({ bases: [], formula: { read: "unavailable", release: null, changed: [] }, snapshotsRead: "no_access", checkedAt: "t" });
  assert.equal(unavailable.status, "unverified");
  assert.deepEqual(unavailable.reasons, []);
  const stale = engineCheck({ bases: [], formula: { ...sameFormula, stale: true }, checkedAt: "t" });
  assert.equal(stale.status, "unverified");
  const staleChange = engineCheck({ bases: [], formula: { read: "ok", release: "abcdef1", changed: ["engine.mex.ts"], stale: true }, checkedAt: "t" });
  assert.equal(staleChange.status, "review");
  assert.equal(engineCheck({ bases: [], formula: sameFormula, checkedAt: "t" }).status, "ok");
});
