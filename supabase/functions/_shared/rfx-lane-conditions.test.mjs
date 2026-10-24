import assert from "node:assert/strict";
import test from "node:test";
import {
  biddingClosed,
  checkConditionAnswer,
  conditionKeyFromRubric,
  conditionRubricKey,
  LEGACY_RUBRIC_KEYS,
  normalizeLaneConditions,
  publicLaneCondition,
  RFX_CONDITION_CATALOG,
  sameRequirement
} from "./rfx-lane-conditions.mjs";

test("catalog keys are unique and never collide with the legacy rubrics", () => {
  const keys = RFX_CONDITION_CATALOG.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) {
    assert.match(key, /^[a-z0-9_]{2,60}$/);
    assert.equal(LEGACY_RUBRIC_KEYS.has(key), false);
  }
});

test("a condition travels as cond.<key> and back", () => {
  assert.equal(conditionRubricKey("cargo_insurance_usd"), "cond.cargo_insurance_usd");
  assert.equal(conditionKeyFromRubric("cond.cargo_insurance_usd"), "cargo_insurance_usd");
  assert.equal(conditionKeyFromRubric("business_rules"), null);
  assert.equal(conditionKeyFromRubric("cond."), null);
});

test("the team's set is checked before it reaches the carrier", () => {
  const rows = normalizeLaneConditions([
    { condition_key: "cargo_insurance_usd", importance: "required", target: "100,000" },
    { key: "ctpat_oea", importance: "preferred", target: "sí" },
    { condition_key: "crossing_model", target: "Direct" }
  ]);
  assert.deepEqual(rows.map((row) => [row.condition_key, row.importance, row.target]), [
    ["cargo_insurance_usd", "required", 100000],
    ["ctpat_oea", "preferred", true],
    ["crossing_model", "required", "direct"]
  ]);
  assert.throws(() => normalizeLaneConditions([{ condition_key: "made_up" }]), /Unknown route condition/);
  assert.throws(() => normalizeLaneConditions([{ condition_key: "hazmat" }, { condition_key: "hazmat" }]), /twice/);
  assert.throws(() => normalizeLaneConditions([{ condition_key: "hazmat", importance: "nice" }]), /required or preferred/);
  assert.throws(() => normalizeLaneConditions([{ condition_key: "transit_days", target: "two" }]), /number/);
  assert.throws(() => normalizeLaneConditions([{ condition_key: "crossing_model", target: "air" }]), /one of/);
});

test("a changed requirement is a new revision; the same one is not", () => {
  const before = { importance: "required", target: 100000, note: null };
  assert.equal(sameRequirement(before, { importance: "required", target: 100000, note: null }), true);
  assert.equal(sameRequirement(before, { importance: "preferred", target: 100000, note: null }), false);
  assert.equal(sameRequirement(before, { importance: "required", target: 250000, note: null }), false);
});

test("carrier answers carry a datum of the right kind and cannot contradict the target", () => {
  const insurance = { condition_key: "cargo_insurance_usd", importance: "required", target: 100000, revision: 2 };
  assert.equal(checkConditionAnswer(insurance, "agree", "150000", ""), 150000);
  assert.throws(() => checkConditionAnswer(insurance, "agree", null, ""), /give the value/);
  assert.equal(checkConditionAnswer({ condition_key: "ctpat_oea", target: true }, "agree", null, ""), null);
  assert.equal(checkConditionAnswer(insurance, "not_applicable", null, ""), null);
  assert.throws(() => checkConditionAnswer(insurance, "agree", 50000, ""), /does not meet/);
  assert.equal(checkConditionAnswer(insurance, "exception", 50000, "Raise to 100k in 30 days"), 50000);
  assert.throws(() => checkConditionAnswer(insurance, "exception", 50000, "  "), /Explain the exception/);
  assert.equal(checkConditionAnswer(insurance, "disagree", 50000, ""), 50000);
  assert.throws(() => checkConditionAnswer(insurance, "agree", "lots", ""), /number/);
  const transit = { condition_key: "transit_days", target: 2 };
  assert.throws(() => checkConditionAnswer(transit, "agree", 3, ""), /does not meet/);
  assert.equal(checkConditionAnswer(transit, "agree", 1, ""), 1);
});

test("the carrier sees the catalog wording plus the team's requirement", () => {
  const shown = publicLaneCondition({ condition_key: "detention_rate_usd_hour", importance: "preferred", target: 50, note: null, revision: 3 });
  assert.equal(shown.rubric_key, "cond.detention_rate_usd_hour");
  assert.equal(shown.segment_key, "lane");
  assert.equal(shown.comparator, "max");
  assert.equal(shown.revision, 3);
  assert.equal(publicLaneCondition({ condition_key: "gone" }), null);
});

test("bidding closes by status or by a passed deadline in Mexico City time", () => {
  const at = new Date("2026-10-22T05:00:00Z"); // 21-oct 23:00 in Mexico City
  assert.equal(biddingClosed({ status: "awarded", due_date: "2026-12-01" }, at), true);
  assert.equal(biddingClosed({ status: "open", due_date: "2026-10-21" }, at), false);
  assert.equal(biddingClosed({ status: "open", due_date: "2026-10-20" }, at), true);
  assert.equal(biddingClosed({ status: "open", due_date: null }, at), false);
  assert.equal(biddingClosed({ status: "draft", due_date: "2026-10-21" }, new Date("2026-10-22T06:00:00Z")), true);
});
