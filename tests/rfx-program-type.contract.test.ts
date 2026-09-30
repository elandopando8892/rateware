// A shipper request can be a program, told apart from a mini-bid ("contract")
// (decided 2026-09-30); anything unknown still falls back to a spot request.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const operator = { sub: "user-1", email: "operator@example.test", rateware_organization_id: "org-a", roles: ["operator"] };

/** A database that echoes inserts back and records them. */
function recordingClient(writes: { table: string; op: string; payload: unknown }[]) {
  const from = (table: string) => {
    let op = "select";
    let payload: unknown = null;
    const chain: unknown = new Proxy(() => chain, {
      get: (_target, name) => {
        if (name === "then") {
          return (resolve: (value: unknown) => void) => {
            if (op !== "select") writes.push({ table, op, payload });
            const row = op === "insert" ? { id: "project-1", ...(payload as Record<string, unknown>) } : null;
            resolve({ data: row, error: null });
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
  return new Proxy({}, { get: (_target, name) => name === "from" ? from : () => Promise.resolve({ data: null, error: null }) });
}

async function create(opportunityType: string) {
  const writes: { table: string; op: string; payload: unknown }[] = [];
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => recordingClient(writes) as never,
    authenticate: () => Promise.resolve(operator as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create_rfx_process_project",
      project: { title: "Programa de prueba", customer_name: "Test Shipper", opportunity_type: opportunityType },
    }),
  }));
  const insert = writes.find((w) => w.table === "rfx_projects" && w.op === "insert");
  return { status: response.status, insert: insert?.payload as Record<string, unknown> | undefined };
}

Deno.test("a request can be a program, apart from a mini-bid", async () => {
  const program = await create("program");
  assertEquals(program.status, 200);
  assert(program.insert, "the request is stored");
  assertEquals(program.insert.opportunity_type, "program");

  const miniBid = await create("contract");
  assertEquals(miniBid.insert?.opportunity_type, "contract");

  const unknown = await create("mini_bid");
  assertEquals(unknown.insert?.opportunity_type, "spot", "an unknown type still falls back to spot");
});
