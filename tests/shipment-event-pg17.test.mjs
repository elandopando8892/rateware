import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = `rateware-shipment-events-pg17-${randomUUID().slice(0, 8)}`;
assert.match(container, /^rateware-shipment-events-pg17-[a-f0-9]{8}$/);
const migration = readFileSync(new URL("../supabase/migrations/20260907030000_shipment_creation_event_ledger.sql", import.meta.url), "utf8");
const hashConstraint = readFileSync(new URL("../supabase/migrations/20260908010000_shipment_event_request_hash_constraint.sql", import.meta.url), "utf8");
const hash = `sha256:${"a".repeat(64)}`;

function docker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function sql(value) {
  return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: value });
}

try {
  docker(["run", "--detach", "--rm", "--name", container, "-e", "POSTGRES_PASSWORD=synthetic-only", "postgres:17-alpine"]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const logs = spawnSync("docker", ["logs", container], { encoding: "utf8" });
    const initialized = `${logs.stdout || ""}\n${logs.stderr || ""}`.includes("PostgreSQL init process complete; ready for start up.");
    const probe = initialized
      ? spawnSync("docker", ["exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", "select 1"], { encoding: "utf8" })
      : { status: 1 };
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  assert.equal(ready, true, "temporary PostgreSQL did not become ready");

  const base = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.rfx_events (
  id uuid primary key, owner_email text, organization_id text,
  rfx_id text, customer text, status text
);
create table public.rfx_lanes (
  id uuid primary key, rfx_event_id uuid not null references public.rfx_events(id),
  origin text, origin_city text, origin_state text,
  destination text, destination_city text, destination_state text
);
`;

  const checks = `
insert into public.rfx_events values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','org:alpha','org-alpha','RFX-1180','Aceros del Norte','awarded');
insert into public.rfx_lanes values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Monterrey, NL',null,null,'Laredo, TX',null,null);

do $$
declare
  first_id uuid;
  replay_id uuid;
  was_replayed boolean;
  visible_count integer;
begin
  select event_id, replayed into first_id, was_replayed
  from public.rateware_register_shipment_created(
    'org-alpha','fleetrocket-execution-receipt.v1','receipt-4471','idempotency-4471',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'IL-4471',2,'executed',true,'2026-09-07T02:00:00Z','prod','XBF-LD-4471',
    '${hash}','${hash}'
  );
  if first_id is null or was_replayed then raise exception 'first insert was not new'; end if;

  select event_id, replayed into replay_id, was_replayed
  from public.rateware_register_shipment_created(
    'org-alpha','fleetrocket-execution-receipt.v1','receipt-4471','idempotency-4471',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'IL-4471',2,'executed',true,'2026-09-07T02:00:00Z','prod','XBF-LD-4471',
    '${hash}','${hash}'
  );
  if replay_id <> first_id or not was_replayed then raise exception 'replay did not converge'; end if;

  select count(*) into visible_count
  from public.rateware_search_shipment_creation_events('org-alpha','RFX-1180',null,null,25)
  where event_id = first_id and fleet_rocket_load_number = 'XBF-LD-4471'
    and rfx_reference = 'RFX-1180' and customer_name = 'Aceros del Norte'
    and origin = 'Monterrey, NL' and destination = 'Laredo, TX';
  if visible_count <> 1 then raise exception 'safe projection mismatch'; end if;

  select count(*) into visible_count
  from public.rateware_get_shipment_creation_event('org-beta', first_id);
  if visible_count <> 0 then raise exception 'cross-organization detail escaped'; end if;

  begin
    perform * from public.rateware_register_shipment_created(
      'org-alpha','fleetrocket-execution-receipt.v1','receipt-rehearsal','idempotency-rehearsal',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,'IL-2',1,'rehearsal',false,
      '2026-09-07T02:01:00Z','demo','XBF-LD-BLOCKED','${hash}','${hash}'
    );
    raise exception 'rehearsal unexpectedly emitted shipment.created';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform * from public.rateware_register_shipment_created(
      'org-alpha','fleetrocket-execution-receipt.v1','receipt-changed','idempotency-4471',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'IL-4471',2,'executed',true,'2026-09-07T02:00:00Z','prod','XBF-LD-9999',
      '${hash}','${hash}'
    );
    raise exception 'changed replay unexpectedly succeeded';
  exception when unique_violation then null;
  end;

  if (select count(*) from public.rateware_shipment_creation_events) <> 1 then
    raise exception 'ledger is not append-only/idempotent';
  end if;
  if not has_table_privilege('service_role','public.rateware_shipment_creation_events','SELECT')
    or has_table_privilege('service_role','public.rateware_shipment_creation_events','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.rateware_shipment_creation_events','SELECT')
  then raise exception 'table privileges mismatch'; end if;
  if not has_function_privilege('service_role','public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)','EXECUTE')
  then raise exception 'function privileges mismatch'; end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid='public.rateware_shipment_creation_events'::regclass)
  then raise exception 'RLS is not enabled'; end if;
end;
$$;
`;

  const output = sql(`${base}\n${migration}\n${hashConstraint}\n${checks}`);
  assert.match(output, /DO/);
  console.log("Shipment event PostgreSQL 17 tests passed.");
} finally {
  spawnSync("docker", ["rm", "--force", container], { encoding: "utf8" });
}
