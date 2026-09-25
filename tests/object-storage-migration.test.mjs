import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907062502_oracle_object_storage_contingency.sql", import.meta.url),
  "utf8",
);
const storageApi = readFileSync(
  new URL("../supabase/functions/rateware-storage-api/index.ts", import.meta.url),
  "utf8",
);
const ratewareApi = readFileSync(
  new URL("../supabase/functions/rateware-api/index.ts", import.meta.url),
  "utf8",
);
const routing = readFileSync(
  new URL("../supabase/functions/_shared/source-download-routing.mjs", import.meta.url),
  "utf8",
);

test("existing storage pointers remain on Supabase by default", () => {
  assert.match(migration, /storage_provider text not null default 'supabase'/);
  assert.match(migration, /storage_provider in \('supabase','oracle_s3'\)/);
  assert.match(migration, /storage_sha256 is null or storage_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
});

test("source reads and Oracle removals route through the provider-neutral storage API", () => {
  assert.match(storageApi, /\.eq\("owner_email", user\.owner_email\)/);
  assert.match(storageApi, /body\.confirmed !== true/);
  assert.match(storageApi, /confirmation_action !== "remove_upload"/);
  // Only files kept outside Supabase Storage go through the storage service.
  assert.match(ratewareApi, /storage_provider !== "supabase"\) \{\s*const forwarded = await forwardSourceDownload\(request, body, SUPABASE_URL\)/);
  assert.match(ratewareApi, /storage_provider !== "supabase"\) \{\s*const forwarded = await forwardSourceRemoval\(request, body, SUPABASE_URL\)/);
  assert.match(routing, /confirmed: body\.confirmed, confirmation_action: body\.confirmation_action/);
  assert.match(routing, /functions\/v1\/rateware-storage-api/);
  assert.match(routing, /Authorization: authorization/);
  assert.doesNotMatch(routing, /SERVICE_ROLE|OCI_S3_|oraclecloud\.com/);
});

test("replica ledger is server-only and records verification evidence", () => {
  assert.match(migration, /create table if not exists public\.object_storage_replicas/);
  assert.match(migration, /object_sha256 text/);
  assert.match(migration, /verified_at timestamptz/);
  assert.match(migration, /alter table public\.object_storage_replicas enable row level security/);
  assert.match(migration, /revoke all on table public\.object_storage_replicas from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.object_storage_replicas to service_role/);
  assert.doesNotMatch(migration, /create policy/i);
});
