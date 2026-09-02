import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../supabase/migrations/20260608120000_vendor_crm.sql");
const seed = read("../supabase/migrations/20260617150000_import_sourcing_base_google_sheet.sql");
const scope = read("../supabase/migrations/20260617162000_scope_vendors_by_user.sql");
const generator = read("../tools/generate-vendor-sheet-migration.mjs");

for (const source of [seed, generator]) {
  assert.match(
    source,
    /on conflict \(vendor_name, domain\) do update set/,
    "vendor seed must target the historical composite unique constraint",
  );
  assert.doesNotMatch(
    source,
    /on conflict \(domain\) do update set/,
    "vendor seed must not depend on a domain-only constraint",
  );
}

assert.match(
  schema,
  /constraint vendors_name_or_domain_unique unique \(vendor_name, domain\)/,
  "the composite conflict arbiter must exist before the seed migration",
);
assert.match(
  scope,
  /drop constraint vendors_name_or_domain_unique/,
  "owner scoping may remove the historical arbiter only after the seed migration",
);

console.log("Vendor seed migration guards passed.");
