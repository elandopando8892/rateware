import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

function compileApiNormalizers(source, includeLegacy = false) {
  const normalize = extractFunction(source, "normalizeCommercialModel")
    .replace("value: unknown", "value")
    .replace("const aliases: Record<string, string> =", "const aliases =");
  const legacy = includeLegacy
    ? extractFunction(source, "legacyCommercialModel").replace("value: unknown", "value")
    : "";
  const update = extractFunction(source, "normalizeCommercialModelForUpdate")
    .replace("value: unknown", "value")
    .replace("currentValue: unknown", "currentValue");
  return Function(`
    const cleanText = (value) => {
      const text = value === null || value === undefined ? "" : String(value).trim();
      return text || null;
    };
    ${normalize}
    ${legacy}
    ${update}
    return { normalizeCommercialModel, normalizeCommercialModelForUpdate${includeLegacy ? ", legacyCommercialModel" : ""} };
  `)();
}

function compileBrowserLegacy(source) {
  return Function(`${extractFunction(source, "legacyCommercialModel")}; return legacyCommercialModel;`)();
}

const ratewareApi = read("supabase/functions/rateware-api/index.ts");
const bidApi = read("supabase/functions/rfx-bid-api/index.ts");
const bidRoom = read("src/rfx-events.js");
const carrierPortal = read("src/rfx-bid.js");

const expectedCanonical = new Map([
  ["fee_plus", "fee_plus"],
  ["cost_plus", "cost_plus"],
  ["direct_cost_plus", "cost_plus"],
  ["sell_share", "sell_share"],
  ["carrier_share", "sell_share"],
  ["brokerage", "brokerage"],
  ["xbf_buy_sell", "brokerage"]
]);
const expectedLegacy = new Map([
  ["fee_plus", "direct_cost_plus"],
  ["cost_plus", "direct_cost_plus"],
  ["direct_cost_plus", "direct_cost_plus"],
  ["sell_share", "carrier_share"],
  ["carrier_share", "carrier_share"],
  ["brokerage", "xbf_buy_sell"],
  ["xbf_buy_sell", "xbf_buy_sell"]
]);

const internalApi = compileApiNormalizers(ratewareApi);
const carrierApi = compileApiNormalizers(bidApi, true);
for (const [input, expected] of expectedCanonical) {
  assert.equal(internalApi.normalizeCommercialModel(input), expected, `rateware-api should canonicalize ${input}`);
  assert.equal(carrierApi.normalizeCommercialModel(input), expected, `rfx-bid-api should canonicalize ${input}`);
}
assert.equal(internalApi.normalizeCommercialModel("not-a-model"), null);
assert.equal(carrierApi.normalizeCommercialModel("not-a-model"), null);
for (const api of [internalApi, carrierApi]) {
  assert.equal(api.normalizeCommercialModelForUpdate("direct_cost_plus", "fee_plus"), "fee_plus", "legacy clients must not silently rewrite Fee-Plus");
  assert.equal(api.normalizeCommercialModelForUpdate("cost_plus", "fee_plus"), "cost_plus", "an explicit canonical model may replace Fee-Plus");
  assert.equal(api.normalizeCommercialModelForUpdate("carrier_share", "fee_plus"), "sell_share");
}

const browserNormalizers = [compileBrowserLegacy(bidRoom), compileBrowserLegacy(carrierPortal)];
for (const normalize of browserNormalizers) {
  for (const [input, expected] of expectedLegacy) {
    assert.equal(normalize(input), expected, `browser should understand ${input}`);
  }
}
for (const [input, expected] of expectedLegacy) {
  assert.equal(carrierApi.legacyCommercialModel(input), expected, `carrier API economics should understand ${input}`);
}

assert.match(bidRoom, /rfxManualBidCommercialModel\.value = commercialModel;/);
assert.match(bidRoom, /commercial_model: commercialModel,/);
assert.match(ratewareApi, /patch\.commercial_model = normalizeCommercialModelForUpdate\(input\.commercial_model, before\.commercial_model\)/);
assert.match(ratewareApi, /patch\.commercial_model = normalizeCommercialModelForUpdate\(patchInput\.commercial_model, ownedResult\.data\.commercial_model\)/);
assert.match(bidApi, /commercial_model: commercialModel,/);

console.log("Commercial model compatibility tests passed (canonical writes + legacy UI reads).\n");
