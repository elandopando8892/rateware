// The dashboard summary counts the offers priced since the caller's day began
// (decided 2026-09-29), only for a recent start and without ever failing the
// summary. Read-only: any write fails the test.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const viewer = { sub: "user-1", email: "viewer@example.test", rateware_organization_id: "org-a", roles: ["viewer"] };

/** Every table answers a count of 7; calls on rfx_lane_vendors are recorded. */
function countingClient(calls: unknown[][]) {
  const from = (table: string) => {
    const chain: unknown = new Proxy(() => chain, {
      get: (_target, name) => {
        if (name === "then") return (resolve: (value: unknown) => void) => resolve({ data: null, count: 7, error: null });
        if (["insert", "update", "upsert", "delete"].includes(String(name))) throw new Error(`unexpected write to ${table}`);
        return (...args: unknown[]) => {
          if (table === "rfx_lane_vendors") calls.push([String(name), ...args]);
          return chain;
        };
      },
      apply: () => chain,
    });
    return chain;
  };
  return new Proxy({}, { get: (_target, name) => name === "from" ? from : () => Promise.resolve({ data: null, error: null }) });
}

async function summary(body: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const client = countingClient(calls);
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve(viewer as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "dashboard_summary", ...body }),
  }));
  return { status: response.status, body: await response.json(), calls };
}

Deno.test("the dashboard counts today's offers from the caller's own start of day", async () => {
  const since = new Date(Date.now() - 3 * 3600000).toISOString();
  const result = await summary({ bids_since: since });
  assertEquals(result.status, 200);
  assertEquals(result.body.rfx_bids_since, 7);
  const gte = result.calls.find((call) => call[0] === "gte");
  assert(gte, "the count starts at the given time");
  assertEquals(gte[1], "responded_at");
  assertEquals(gte[2], since);
  assert(result.calls.some((call) => call[0] === "not" && call[1] === "bid_rate"), "only priced offers count");
});

Deno.test("without a recent start the summary leaves the day's offers out", async () => {
  for (const body of [{}, { bids_since: "not a date" }, { bids_since: "2020-01-01T00:00:00Z" }, { bids_since: "2999-01-01T00:00:00Z" }]) {
    const result = await summary(body);
    assertEquals(result.status, 200);
    assertEquals("rfx_bids_since" in result.body, false, JSON.stringify(body));
  }
});
