import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizedAllInFromFuel } from "../supabase/functions/_shared/rate-normalization.mjs";

assert.equal(normalizedAllInFromFuel({
  allIn: 2500,
  carrierFscTotal: null,
  normalizedFscTotal: 343.65,
  linehaul: 0,
  borderFee: 0
}), 2500, "an all-in quote without itemized FSC must remain unchanged");

assert.equal(normalizedAllInFromFuel({
  allIn: 2500,
  carrierFscTotal: 300,
  normalizedFscTotal: 343.65,
  linehaul: 0,
  borderFee: 0
}), 2543.65, "an all-in quote may be normalized when carrier FSC is explicit");

assert.equal(normalizedAllInFromFuel({
  allIn: null,
  carrierFscTotal: null,
  normalizedFscTotal: 343.65,
  linehaul: 2000,
  borderFee: 100
}), 2443.65, "itemized linehaul and border fee may form a normalized total");

assert.equal(normalizedAllInFromFuel({
  allIn: null,
  carrierFscTotal: null,
  normalizedFscTotal: 343.65,
  linehaul: 0,
  borderFee: 0
}), null, "FSC alone must not be promoted to an all-in rate");

assert.equal(normalizedAllInFromFuel({
  allIn: 2500,
  carrierFscTotal: null,
  normalizedFscTotal: null,
  linehaul: 0,
  borderFee: 0
}), 2500, "missing reference FSC must not erase an explicit all-in rate");

const interpretUploadSource = readFileSync(new URL("../supabase/functions/interpret-upload/index.ts", import.meta.url), "utf8");
assert.match(
  interpretUploadSource,
  /const normalizedAllIn = normalizedAllInFromFuel\(\{\s*allIn,\s*carrierFscTotal,\s*normalizedFscTotal,\s*linehaul,\s*borderFee\s*\}\)/,
  "interpret-upload must delegate the production calculation to the tested helper"
);
assert.match(interpretUploadSource, /"valid_through",\s*"row_id"/, "the strict row schema must require valid_through");
assert.match(interpretUploadSource, /valid_through:\s*\{ type: \["string", "null"\] \}/, "the schema must accept an explicit validity date");
assert.match(interpretUploadSource, /valid_through:\s*cleanDate\(interpreted\.valid_through\)/, "the normalized row must persist valid_through");

console.log("Interpret-upload normalization tests passed.");
