// Declaring a lane void ("desierto") and the close rule it completes (decided 2026-09-29):
// every lane ends with a primary or declared void, and a void lane is never awarded.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const EVENT = "00000000-0000-4000-8000-0000000000e1";
const LANE_1 = "00000000-0000-4000-8000-0000000000a1";
const LANE_2 = "00000000-0000-4000-8000-0000000000a2";
const LANE_3 = "00000000-0000-4000-8000-0000000000a3";
const admin = { sub: "user-1", email: "Admin@Example.com", rateware_organization_id: "org-a", roles: ["admin"] };

type Answer = { data: unknown; error: null };
type Tables = Record<string, Answer | ((op: string, payload: unknown) => Answer)>;

/** A database that answers each table from `tables` and records every write. */
function tableClient(tables: Tables) {
  const writes: { table: string; op: string; payload: unknown }[] = [];
  const from = (table: string) => {
    let op = "select";
    let payload: unknown = null;
    const chain: unknown = new Proxy(() => chain, {
      get: (_target, name) => {
        if (name === "then") {
          return (resolve: (value: unknown) => void) => {
            if (op !== "select") writes.push({ table, op, payload });
            const entry = tables[table];
            resolve(typeof entry === "function" ? entry(op, payload) : entry ?? { data: null, error: null });
          };
        }
        return (...args: unknown[]) => {
          if (["insert", "update", "upsert", "delete"].includes(String(name))) {
            op = String(name);
            payload = args[0];
          }
          return chain;
        };
      },
      apply: () => chain,
    });
    return chain;
  };
  const client = new Proxy({}, {
    get: (_target, name) => name === "from" ? from : () => Promise.resolve({ data: null, error: null }),
  });
  return { client, writes };
}

async function call(tables: Tables, claims: Record<string, unknown>, body: Record<string, unknown>) {
  const { client, writes } = tableClient(tables);
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve(claims as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json(), writes };
}

const openEvent = { data: { id: EVENT, status: "open", owner_email: "org:org-a", rfx_id: "RFX-1", name: "Prueba" }, error: null };
const lanesAnswer = (lanes: Record<string, unknown>[]) => (op: string, payload: unknown) => op === "update"
  ? { data: lanes.map((lane) => ({ ...lane, ...(payload as Record<string, unknown>) })), error: null }
  : { data: lanes, error: null };
const declaring = { action: "set_rfx_lane_no_award", rfx_event_id: EVENT, lane_ids: [LANE_1, LANE_2], reason: "El cliente canceló la ruta" };

Deno.test("an Administrador declares lanes void, and who did it is recorded", async () => {
  const result = await call({
    rfx_events: openEvent,
    rfx_lanes: lanesAnswer([{ id: LANE_1, lane_number: 1, no_award_at: null }, { id: LANE_2, lane_number: 2, no_award_at: null }]),
    rfx_lane_vendors: { data: [], error: null },
  }, admin, declaring);
  assertEquals(result.status, 200);
  assertEquals(result.body.updated, 2);
  const update = result.writes.find((write) => write.table === "rfx_lanes" && write.op === "update");
  const patch = update?.payload as Record<string, unknown>;
  assert(patch?.no_award_at, "the lane is marked void");
  assertEquals(patch.no_award_reason, "El cliente canceló la ruta");
  assertEquals(patch.no_award_by, "admin@example.com", "the person, not the workspace");
  assert(result.writes.some((write) => write.table === "saas_audit_log" && write.op === "insert"), "the decision is audited");
});

Deno.test("a lane with a primary or a backup is not declared void", async () => {
  const result = await call({
    rfx_events: openEvent,
    rfx_lanes: lanesAnswer([{ id: LANE_1, lane_number: 1, no_award_at: null }, { id: LANE_2, lane_number: 2, no_award_at: null }]),
    rfx_lane_vendors: { data: [{ rfx_lane_id: LANE_2, award_role: "backup", invitation_status: "quoted" }], error: null },
  }, admin, declaring);
  assertEquals(result.status, 409);
  assertEquals(result.body.code, "lane_has_award");
  assertEquals(result.body.lane_ids, [LANE_2]);
  assertStringIncludes(result.body.error, "#2");
  assertEquals(result.writes.filter((write) => write.table === "rfx_lanes"), [], "nothing changed");
});

Deno.test("reopening clears the decision without asking about awards", async () => {
  const result = await call({
    rfx_events: openEvent,
    rfx_lanes: lanesAnswer([{ id: LANE_1, lane_number: 1, no_award_at: "2026-09-29T18:00:00Z" }]),
  }, admin, { action: "set_rfx_lane_no_award", rfx_event_id: EVENT, lane_ids: [LANE_1], no_award: false });
  assertEquals(result.status, 200);
  const patch = result.writes.find((write) => write.table === "rfx_lanes" && write.op === "update")?.payload as Record<string, unknown>;
  assertEquals([patch.no_award_at, patch.no_award_reason, patch.no_award_by], [null, null, null]);
});

Deno.test("a lane already in the asked state is left as it is", async () => {
  const result = await call({
    rfx_events: openEvent,
    rfx_lanes: lanesAnswer([{ id: LANE_1, lane_number: 1, no_award_at: "2026-09-29T18:00:00Z" }]),
    rfx_lane_vendors: { data: [], error: null },
  }, admin, { action: "set_rfx_lane_no_award", rfx_event_id: EVENT, lane_ids: [LANE_1] });
  assertEquals(result.status, 200);
  assertEquals([result.body.updated, result.body.unchanged], [0, 1]);
  assertEquals(result.writes, [], "a retry writes nothing");
});

Deno.test("a closed event's lanes don't change, and a lane of another event is refused", async () => {
  const closed = await call({ rfx_events: { data: { ...openEvent.data, status: "closed" }, error: null } }, admin, declaring);
  assertEquals(closed.status, 409);
  assertEquals(closed.writes, []);
  const foreign = await call({
    rfx_events: openEvent,
    rfx_lanes: lanesAnswer([{ id: LANE_1, lane_number: 1, no_award_at: null }]),
  }, admin, declaring);
  assertEquals(foreign.status, 404);
  assertEquals(foreign.writes, []);
  const invalid = await call({}, admin, { action: "set_rfx_lane_no_award", rfx_event_id: EVENT, lane_ids: ["not-a-lane"] });
  assertEquals(invalid.status, 400);
});

Deno.test("an operator can't declare a lane void", async () => {
  const result = await call({}, { ...admin, roles: ["operator"] }, declaring);
  assertEquals(result.status, 403);
  assertEquals(result.body.required, "admin");
  assertEquals(result.writes, []);
});

Deno.test("closing asks every lane for a primary or a void, and a void lane needs neither", async () => {
  const result = await call({
    rfx_events: openEvent,
    rfx_lanes: {
      data: [
        { id: LANE_1, lane_number: 1, origin: "Monterrey", destination: "Laredo", no_award_at: null },
        { id: LANE_2, lane_number: 2, origin: "Saltillo", destination: "Dallas", no_award_at: null },
        { id: LANE_3, lane_number: 3, origin: "Puebla", destination: "Houston", no_award_at: "2026-09-29T18:00:00Z" },
      ],
      error: null,
    },
    rfx_lane_vendors: {
      data: [
        { id: "i-1", rfx_lane_id: LANE_1, bid_rate: 1200, award_role: "primary", invitation_status: "awarded" },
        { id: "i-3", rfx_lane_id: LANE_3, bid_rate: 1900, award_role: null, invitation_status: "quoted" },
      ],
      error: null,
    },
  }, admin, { action: "update_rfx_event", id: EVENT, patch: { status: "closed" } });
  assertEquals(result.status, 409);
  assertStringIncludes(result.body.error, "#2 Saltillo -> Dallas", "a lane nobody bid on is declared void, not left open");
  assert(!result.body.error.includes("#3"), "the void lane had bids and no primary, and still closes");
  assert(!result.body.error.includes("#1"));
  assertEquals(result.writes.filter((write) => write.table === "rfx_events"), [], "the event was not closed");
});

Deno.test("a void lane is not awarded", async () => {
  const result = await call({
    rfx_lane_vendors: {
      data: { id: "i-3", rfx_lane_id: LANE_3, bid_rate: 1900, rfx_events: openEvent.data, rfx_lanes: { id: LANE_3, no_award_at: "2026-09-29T18:00:00Z" } },
      error: null,
    },
  }, admin, { action: "award_rfx_lane_vendor", id: "i-3", award_role: "primary" });
  assertEquals(result.status, 409);
  assertStringIncludes(result.body.error, "desierto");
});
