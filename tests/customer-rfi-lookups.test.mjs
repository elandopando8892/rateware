import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The shipper's form reaches places and freight lists through its own link.
// These checks pin what those lookups return and what they keep out.
const source = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

function extractConst(name) {
  const match = source.match(new RegExp(`const ${name}(?::[^=]+)? = [^;]+;`));
  assert.ok(match, `${name} must exist`);
  return match[0];
}

// Just enough type stripping for the annotations these helpers use.
const stripTypes = (code) =>
  code
    .replace(/\s+as\s+Record<string, unknown>(\[\])?/g, "")
    .replace(/\): Record<string, unknown> \{/g, ") {")
    .replace(/: Record<string, Set<string>>/g, "")
    .replace(/: Record<string, string\[\]>/g, "")
    .replace(/\(value: unknown\)/g, "(value)")
    .replace(/\(location: Record<string, unknown>\)/g, "(location)")
    .replace(/\(rows: Record<string, unknown>\[\], ownerEmail: string \| null\)/g, "(rows, ownerEmail)")
    .replace(/: Record<string, unknown>/g, "")
    .replace(/new Set<string>\(\)/g, "new Set()");

const helpers = [
  extractFunction("cleanText"),
  extractFunction("objectRecord"),
  extractConst("CUSTOMER_RFI_OPTION_CATEGORIES"),
  extractConst("CUSTOMER_RFI_HIDDEN_OPTIONS"),
  extractFunction("customerRfiLocationSearch"),
  extractFunction("customerRfiLocationOption"),
  extractFunction("customerRfiCatalogOptions")
].map(stripTypes).join("\n");

const { customerRfiLocationSearch, customerRfiLocationOption, customerRfiCatalogOptions } = new Function(
  `${helpers}\nreturn { customerRfiLocationSearch, customerRfiLocationOption, customerRfiCatalogOptions };`
)();

// Search text can't break out of the PostgREST or-filter it is placed in.
assert.equal(customerRfiLocationSearch("  Monterrey, NL "), "Monterrey NL");
assert.equal(customerRfiLocationSearch('a),city.eq."x"%_*\\'), "a city.eq. x");
assert.equal(customerRfiLocationSearch("x".repeat(200)).length, 80);
assert.equal(customerRfiLocationSearch(null), "");

// A place carries its geography but not the catalog's internal source.
const place = customerRfiLocationOption({
  id: 7,
  source: "rateware_reference_catalog",
  raw_value: "MONTERREY, NL",
  metro_city: "Monterrey",
  city: "MONTERREY",
  state_code: "NL",
  country: "MX",
  zip_prefix: "64",
  market: "Monterrey",
  region: "Noreste"
});
assert.equal(place.value, "MONTERREY, NL");
assert.equal(place.label, "Monterrey | 64 | Monterrey | Noreste | MX");
assert.equal(place.country, "MX");
assert.equal("source" in place, false);

// Lists: active values only, no other workspace's manual items, no backhaul.
const lists = customerRfiCatalogOptions([
  { category: "equipment", source: "rateware_seed", normalized_value: "Truck Trailer", active: true },
  { category: "equipment", source: "rateware_seed", normalized_value: "truck trailer", active: true },
  { category: "equipment", source: "rateware_seed", normalized_value: "DV53", active: false },
  { category: "trailer", source: "rateware_manual_catalog", normalized_value: "Ours", metadata: { owner_email: "org:mine" }, active: true },
  { category: "trailer", source: "rateware_manual_catalog", normalized_value: "Theirs", metadata: { owner_email: "org:other" }, active: true },
  { category: "service", source: "rateware_seed", normalized_value: "Backhaul", active: true },
  { category: "service", source: "rateware_seed", normalized_value: "One Way", active: true },
  { category: "driver", source: "rateware_seed", normalized_value: "Team", active: true }
], "org:mine");
assert.deepEqual(lists.equipment, ["Truck Trailer"]);
assert.deepEqual(lists.trailer, ["Ours"]);
assert.deepEqual(lists.service, ["One Way"]);
assert.equal("driver" in lists, false);
assert.deepEqual(Object.keys(lists).sort(), ["config", "equipment", "operation", "service", "trailer"]);

// Both lookups sit behind the shipper's link, before any read.
for (const handler of ["customerRfiSearchLocations", "customerRfiOptions"]) {
  const body = extractFunction(handler);
  assert.match(body, /^[^]*?\{\s*(?:const \{ project \} = )?await currentCustomerRfiContext\(supabase, input\.token\);/, `${handler} must validate the link first`);
}
assert.match(source, /body\.action === "customer_rfi_search_locations"[\s\S]{0,120}customerRfiSearchLocations\(supabase, body\)/);
assert.match(source, /body\.action === "customer_rfi_options"[\s\S]{0,120}customerRfiOptions\(supabase, body\)/);

console.log("Customer RFI lookup checks passed.");
