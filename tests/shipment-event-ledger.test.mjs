import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260907030000_shipment_creation_event_ledger.sql", import.meta.url), "utf8");
const hashConstraint = readFileSync(new URL("../supabase/migrations/20260908010000_shipment_event_request_hash_constraint.sql", import.meta.url), "utf8");
const handler = readFileSync(new URL("../supabase/functions/shipment-context-api/handler.ts", import.meta.url), "utf8");
const ingestIndex = readFileSync(new URL("../supabase/functions/shipment-event-ingest-api/index.ts", import.meta.url), "utf8");
const ingestHandler = readFileSync(new URL("../supabase/functions/shipment-event-ingest-api/handler.ts", import.meta.url), "utf8");

assert.match(migration, /create table if not exists public\.rateware_shipment_creation_events/);
assert.match(migration, /event_type = 'shipment\.created'/);
assert.match(migration, /p_receipt_mode <> 'executed'/);
assert.match(migration, /p_external_execution is distinct from true/);
assert.match(migration, /on conflict \(organization_id, idempotency_key\) do nothing/);
assert.match(migration, /SHIPMENT_EVENT_IDEMPOTENCY_CONFLICT/);
assert.match(migration, /revoke all on table public\.rateware_shipment_creation_events from public, anon, authenticated, service_role/);
assert.match(migration, /grant select on table public\.rateware_shipment_creation_events to service_role/);
assert.doesNotMatch(migration, /grant (insert|update|delete).*authenticated/i);
assert.match(migration, /grant execute on function public\.rateware_register_shipment_created[\s\S]*to service_role/);
assert.match(hashConstraint, /request_payload_hash ~ '\^sha256:\[a-f0-9\]\{64\}\$'/);
assert.match(hashConstraint, /validate constraint rateware_shipment_events_request_payload_hash_format/);
assert.match(handler, /search_shipment_creation_events/);
assert.match(handler, /get_shipment_creation_event/);
assert.doesNotMatch(handler, /register_shipment_creation_event|rateware_register_shipment_created/);
assert.doesNotMatch(handler, /commercialHandoff|agreedFreight|carrierOrganizationId/);
assert.doesNotMatch(ingestIndex, /request\.clone\(\)\.json|JSON\.parse/);
assert.match(ingestHandler, /raw\.length > 16_384/);
assert.match(ingestHandler, /JSON\.parse\(raw\)/);

console.log("Shipment event ledger contract tests passed.");
