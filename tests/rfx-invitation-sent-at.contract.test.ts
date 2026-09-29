// The RFx detail says when each invitation's message really went out
// (decided 2026-09-29). Authorizing an invitation stamps invited_at without
// sending anything, so the team's "sent" counts come from the messages the
// provider accepted, not from the invitation's own status.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const EVENT = "00000000-0000-4000-8000-0000000000e7";
const LANE = "00000000-0000-4000-8000-0000000000b7";
const viewer = { sub: "user-1", email: "viewer@example.test", rateware_organization_id: "org-a", roles: ["viewer"] };

type Answer = { data: unknown; error: unknown };

/** A read-only database: each table answers from `tables`; any write fails the test. */
function tableClient(tables: Record<string, Answer>) {
  const from = (table: string) => {
    const chain: unknown = new Proxy(() => chain, {
      get: (_target, name) => {
        if (name === "then") {
          return (resolve: (value: unknown) => void) => resolve(tables[table] ?? { data: null, error: null });
        }
        if (["insert", "update", "upsert", "delete"].includes(String(name))) {
          throw new Error(`unexpected write to ${table}`);
        }
        return () => chain;
      },
      apply: () => chain,
    });
    return chain;
  };
  return new Proxy({}, {
    get: (_target, name) => name === "from" ? from : () => Promise.resolve({ data: null, error: null }),
  });
}

async function detail(outreach: Answer) {
  const invitation = (id: string, extra: Record<string, unknown> = {}) => ({
    id, rfx_event_id: EVENT, rfx_lane_id: LANE, vendor_id: `vendor-${id}`, invitation_status: "invited",
    invited_at: "2099-01-01T00:00:00Z", bid_rate: null, currency: "USD", vendors: { id: `vendor-${id}`, vendor_name: id },
    ...extra,
  });
  const client = tableClient({
    rfx_events: { data: { id: EVENT, status: "draft", owner_email: "org:org-a", rfx_id: "RFX-SENT", name: "Prueba" }, error: null },
    rfx_lanes: { data: [{ id: LANE, rfx_event_id: EVENT, lane_number: 1, origin: "Monterrey", destination: "Laredo" }], error: null },
    rfx_lane_vendors: {
      data: [
        invitation("authorized-only"),
        invitation("sent"),
        invitation("bounced"),
        invitation("sent-in-list"),
        invitation("drafted", { invitation_status: "drafted", invited_at: null }),
      ],
      error: null,
    },
    outreach_messages: outreach,
  });
  const handler = ratewareApi.createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve(viewer as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-1", owner_email: "org:org-a", organization_id: "org-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list_rfx_detail", event_id: EVENT }),
  }));
  return { status: response.status, body: await response.json() };
}

Deno.test("each invitation says when its message really went out, and an authorization alone doesn't count", async () => {
  const result = await detail({
    data: [
      { id: "m1", status: "sent", sent_at: "2099-01-02T10:00:00Z", rfx_lane_vendor_id: "sent", metadata: {} },
      { id: "m2", status: "read", sent_at: "2099-01-03T10:00:00Z", rfx_lane_vendor_id: "sent", metadata: {} },
      // A bounced message went out but never reached the carrier.
      { id: "m3", status: "bounced", sent_at: "2099-01-02T10:00:00Z", rfx_lane_vendor_id: "bounced", metadata: {} },
      // One message can cover several invitations, and an archived wave was still sent.
      { id: "m4", status: "archived", sent_at: "2099-01-01T09:00:00Z", rfx_lane_vendor_id: null, metadata: { rfx_lane_vendor_ids: ["sent-in-list"] } },
    ],
    error: null,
  });
  assertEquals(result.status, 200);
  const sentAt = Object.fromEntries(
    result.body.lanes[0].invitations.map((i: { id: string; outreach_sent_at: unknown }) => [i.id, i.outreach_sent_at]),
  );
  assertEquals(sentAt["authorized-only"], null, "authorizing is not sending");
  assertEquals(sentAt["sent"], "2099-01-03T10:00:00Z", "the latest accepted send");
  assertEquals(sentAt["bounced"], null, "a bounced message doesn't count");
  assertEquals(sentAt["sent-in-list"], "2099-01-01T09:00:00Z");
  assertEquals(sentAt["drafted"], null);
  assertEquals(result.body.outreach_sends.available, true);
});

Deno.test("when the sends can't be read, the RFx still opens and says so", async () => {
  const result = await detail({ data: null, error: { message: "timeout" } });
  assertEquals(result.status, 200);
  assertEquals(result.body.outreach_sends.available, false);
  const invitations = result.body.lanes[0].invitations as Record<string, unknown>[];
  assert(invitations.every((i) => !("outreach_sent_at" in i)), "without the sends the field is left out, not guessed");
});
