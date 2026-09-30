import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });

const EVENT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const COLUMNS = "rfx_lane_vendor_id,vendor_id,segment_key,rubric_key,answer,comment,updated_at";

async function read(eventId: unknown, options: { role?: string; count?: number; fail?: boolean; unauthenticated?: boolean } = {}) {
  const calls: { table: string; columns?: string; filters: Record<string, unknown>; ranges: number[][] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, columns: "", filters: {} as Record<string, unknown>, ranges: [] as number[][] };
      calls.push(call);
      let start = 0, end = 999;
      const chain = {
        select(columns: string) { call.columns = columns; return chain; },
        eq(column: string, value: unknown) { call.filters[column] = value; return chain; },
        order() { return chain; },
        single() { return chain; },
        range(from: number, to: number) { start = from; end = to; call.ranges.push([from, to]); return chain; },
        then(resolve: (value: unknown) => void) {
          if (table === "rfx_events") {
            const owned = call.filters.id === EVENT && call.filters.owner_email === "org:team-a";
            resolve(owned ? { data: { id: EVENT }, error: null } : { data: null, error: { message: "Event not found" } });
          } else if (table === "rfx_segment_confirmations") {
            assertEquals(call.filters.rfx_event_id, EVENT);
            assertEquals(call.columns, COLUMNS);
            const rows = Array.from({ length: options.count ?? 1 }, (_, i) => ({
              rfx_lane_vendor_id: `invitation-${i}`, vendor_id: "carrier-a", segment_key: "general",
              rubric_key: "logistics_model", answer: "agree", comment: null, updated_at: "2026-09-30T12:00:00Z",
            }));
            resolve({ data: options.fail ? null : rows.slice(start, end + 1), error: options.fail ? { message: "Read failed" } : null });
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      // There are no insert/update/delete methods: any write fails this test.
      return chain;
    },
  };
  const handler = createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => options.unauthenticated
      ? Promise.reject(new Error("Unauthorized"))
      : Promise.resolve({ sub: "user-a", email: "viewer@example.test", roles: [options.role ?? "viewer"], rateware_organization_id: "team-a" } as never),
    resolveUser: () => Promise.resolve({ owner_email: "org:team-a", owner_user_id: "user-a", organization_id: "team-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list_rfx_segment_confirmations", event_id: eventId, owner_email: "org:team-b" }),
  }));
  return { status: response.status, body: await response.json(), calls };
}

for (const role of ["viewer", "operator", "admin"]) Deno.test(`${role} lee los siete campos del evento propio sin escrituras`, async () => {
  const result = await read(EVENT, { role });
  assertEquals(result.status, 200);
  assertEquals(result.body.rows.length, 1);
  assertEquals(Object.keys(result.body.rows[0]), COLUMNS.split(","));
  assertEquals(result.calls[0].filters.owner_email, "org:team-a", "No acepta owner_email del body");
});

Deno.test("rechaza otro workspace antes de consultar confirmaciones", async () => {
  const result = await read(OTHER);
  assert(result.status >= 400);
  assert(!result.calls.some(c => c.table === "rfx_segment_confirmations"));
  assert(!result.body.rows);
});

Deno.test("requiere event_id y autenticación", async () => {
  for (const result of [await read(undefined), await read(EVENT, { unauthenticated: true })]) {
    assert(result.status >= 400);
    assert(!result.calls.some(c => c.table === "rfx_segment_confirmations"));
  }
});

Deno.test("no trunca eventos con más de mil confirmaciones", async () => {
  const result = await read(EVENT, { count: 1002 });
  assertEquals(result.status, 200);
  assertEquals(result.body.rows.length, 1002);
  assertEquals(result.calls.filter(c => c.table === "rfx_segment_confirmations").flatMap(c => c.ranges), [[0,999],[1000,1999]]);
});

Deno.test("lista vacía y errores de lectura permanecen distinguibles", async () => {
  assertEquals((await read(EVENT, { count: 0 })).body.rows, []);
  const failed = await read(EVENT, { fail: true });
  assert(failed.status >= 400);
  assert(!failed.body.rows);
});
