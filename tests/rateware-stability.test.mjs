import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");

for (const domain of ["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "yahoo.com.mx"]) {
  assert.match(apiSource, new RegExp(`"${domain.replace(".", "\\.")}"`), `generic domain ${domain} should be blocked`);
}

assert.match(apiSource, /function isGenericEmailDomain/, "API should expose generic-domain guard");
assert.match(apiSource, /!genericDomain && domain && vendorDomain && vendorDomain === domain/, "domain matching should skip generic email domains");
assert.match(apiSource, /if \(!email && genericDomain\) return/, "bare generic domains should not create vendor matches");

assert.match(apiSource, /function canUseSqlRateFilters/, "API should decide when filters can stay in SQL");
assert.match(apiSource, /applySqlRateFilters\(query, filterPayload\)/, "list endpoints should use SQL-backed filters");
assert.match(apiSource, /fetchSqlRateFilterValues/, "column filter value menus should have SQL-backed loading");

assert.match(apiSource, /body\.action === "get_rate_row_detail"/, "Rateware should lazy-load row detail");
assert.match(apiSource, /RATE_ROW_RESPONSE_WITH_LEGS_SELECT/, "row detail should include full audit and lane-leg payload");

assert.match(apiSource, /async function resolveCanonicalUser/, "API should canonicalize owner identity");
assert.match(apiSource, /from\("user_profiles"\)/, "canonical owner resolution should use user_profiles");
assert.match(apiSource, /resolveCanonicalUser\(supabase, userContext/, "request user should be canonicalized before action routing");

console.log("Rateware stability guards passed.");
