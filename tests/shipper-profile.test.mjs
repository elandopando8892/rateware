import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260714100000_shipper_profile_magic_links.sql");
const api = read("../supabase/functions/rateware-api/index.ts");
const service = read("../src/shipper-service.js");
const drawer = read("../src/shippers.js");
const portal = read("../shipper-profile.html");
const portalClient = read("../src/shipper-profile.js");
const portalApi = read("../supabase/functions/shipper-profile-api/index.ts");

assert.match(migration, /create table if not exists public\.shipper_profile_requests/);
assert.match(migration, /token_hash text not null unique/);
assert.match(migration, /create table if not exists public\.shipper_profile_submissions/);
assert.match(migration, /enable row level security/);
assert.match(api, /body\.action === "create_shipper_profile_request"/);
assert.match(api, /body\.action === "revoke_shipper_profile_request"/);
assert.match(api, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(service, /createShipperProfileRequest/);
assert.match(drawer, /Create secure link/);
assert.match(drawer, /data-revoke-shipper-profile-link/);
assert.match(portal, /Customer onboarding profile/);
assert.match(portalClient, /Customer onboarding profile/);
assert.match(portalClient, /Functional contacts/);
assert.match(portalClient, /Addresses and operating sites/);
assert.match(portalClient, /USA pay-to entity/);
assert.match(portalClient, /TMS provider/);
assert.match(portalClient, /readLocations/);
assert.match(portalApi, /action === "get_profile"/);
assert.match(portalApi, /action === "submit_profile"/);
assert.match(portalApi, /shipper_locations/);
assert.match(portalApi, /contact_name/);
assert.doesNotMatch(portalApi, /token_hash:\s*request/);

console.log("Shipper profile magic-link contracts passed.");
