// Why procurement rejected a bid stays with the team (decided 2026-09-29): the
// carrier reads its invitation notes as its own, so the reason goes to the
// event history and the audit log, never into those notes.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const operator = { sub: "user-1", email: "operator@example.test", rateware_organization_id: "org-a", roles: ["operator"] };
const REASON = "motivo-interno-de-rechazo";

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

Deno.test("a rejected bid keeps its reason with the team, not in the carrier's notes", async () => {
  const invitation = {
    id: "invitation-r", rfx_event_id: "event-r", rfx_lane_id: "lane-r", vendor_id: "vendor-r",
    invitation_status: "quoted", bid_rate: 1200, currency: "USD", award_role: null, bid_rate_staging_id: null,
    notes: "Supuestos del carrier: incluye maniobras",
    rfx_events: { id: "event-r", rfx_id: "RFX-R", name: "Prueba", status: "open", owner_email: "org:org-a" },
    rfx_lanes: { id: "lane-r", origin: "Monterrey", destination: "Laredo" },
    vendors: { id: "vendor-r", vendor_name: "Test Carrier" },
  };
  const { client, writes } = tableClient({
    rfx_lane_vendors: (op, payload) => ({
      data: op === "update" ? { ...invitation, ...(payload as Record<string, unknown>) } : invitation,
      error: null,
    }),
    contact_history: { data: [{ id: "history-r" }], error: null },
    saas_audit_log: { data: null, error: null },
  });
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve(operator as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reject_rfx_bid", id: "invitation-r", reason: REASON }),
  }));
  assertEquals(response.status, 200);
  const body = await response.json();

  const update = writes.find((w) => w.table === "rfx_lane_vendors" && w.op === "update");
  assert(update, "the invitation is updated");
  const patch = update.payload as Record<string, unknown>;
  assertEquals(patch.invitation_status, "declined");
  assertEquals(patch.bid_rate, null);
  assertEquals(patch.notes, null, "the carrier's notes don't carry the reason");
  assertEquals(JSON.stringify(body).includes(REASON), false, "nothing the carrier could read holds the reason");

  const history = writes.find((w) => w.table === "contact_history" && w.op === "insert");
  assert(history && JSON.stringify(history.payload).includes(REASON), "the event history keeps the reason");
  const audit = writes.find((w) => w.table === "saas_audit_log" && w.op === "insert");
  assert(audit && JSON.stringify(audit.payload).includes(REASON), "the audit log keeps the reason");
});
