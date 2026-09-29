// What the team keeps to itself never reaches a carrier (decided 2026-09-29):
// the lane's target rate and incumbent carrier, the event's own notes and the
// account that owns it. Covers the carrier's own link (its invitation, lane and
// event) and the Bid Room support assistant, which must not even be told the
// target. Read-only: every database write fails the test.
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "") {
  if (!Object.is(actual, expected)) throw new Error(`${message} expected ${String(expected)}, received ${String(actual)}`);
}

const TARGET = 4321.5;
const INCUMBENT = "Incumbente Interno de Prueba";
const EVENT_NOTES = "nota-interna-del-evento-de-prueba";
const OWNER = "owner-interno@example.test";

const event = {
  id: "event-p", owner_user_id: "owner-user-interno", owner_email: OWNER, rfx_id: "RFx-payload", name: "Programa de prueba",
  customer: "Test Shipper", event_type: "rfx", status: "open", due_date: "2099-12-31", operation_start_date: "2099-01-15",
  bid_visibility_mode: "anonymous_rank", notes: EVENT_NOTES,
};
const lane = {
  id: "lane-p", rfx_event_id: "event-p", lane_number: 1, origin: "Monterrey, NL", destination: "Laredo, TX",
  origin_country: "MX", destination_country: "US", equipment: "Dry Van", currency: "USD", weekly_volume: 12,
  target_rate: TARGET, incumbent_vendor: INCUMBENT, notes: "Cita en planta de 8 a 14 h",
  service_specifications: "GPS | POD firmada",
};
const row = {
  id: "invitation-p", rfx_event_id: "event-p", rfx_lane_id: "lane-p", vendor_id: "vendor-p",
  invitation_status: "viewed", invitation_token: "token-p", invitation_token_hash: null, invitation_token_encrypted: null,
  invited_at: "2099-01-01T00:00:00Z", viewed_at: "2099-01-01T00:00:00Z", currency: "USD", bid_rate: null,
  vendors: { id: "vendor-p", vendor_name: "Test Carrier", domain: "carrier.example", primary_email: "test@carrier.example" },
  rfx_events: event,
  rfx_lanes: lane,
};

Deno.test("a carrier never receives the target, the incumbent or the event's internal notes, nor does its assistant", async () => {
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const envNames = ["SUPABASE_URL", "RATEWARE_SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "OPENAI_MODEL"];
  const previous = Object.fromEntries(envNames.map((name) => [name, Deno.env.get(name)]));
  const assistantRequests: string[] = [];
  let handler: ((request: Request) => Response | Promise<Response>) | undefined;
  try {
    Deno.env.set("SUPABASE_URL", "https://supabase-mock.invalid");
    Deno.env.set("RATEWARE_SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-role-test-only");
    Deno.env.set("OPENAI_API_KEY", "synthetic-assistant-key-test-only");
    Deno.env.set("OPENAI_MODEL", "synthetic-model");
    (Deno as unknown as { serve: typeof Deno.serve }).serve = ((callback: typeof handler) => {
      handler = callback;
      return { shutdown() {} } as unknown as Deno.HttpServer;
    }) as typeof Deno.serve;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      if (url.origin === "https://api.openai.com") {
        // Record what the assistant would be told; answering is not needed.
        assistantRequests.push(String(init?.body ?? ""));
        return new Response("{}", { status: 503 });
      }
      assert(url.origin === "https://supabase-mock.invalid", "unexpected network target");
      if (method !== "GET") throw new Error(`unexpected database write: ${method} ${url.pathname}`);
      const headers = { "Content-Type": "application/json" };
      const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers });
      if (url.pathname.endsWith("/rfx_lane_vendors")) {
        if (url.searchParams.has("invitation_token_hash") || url.searchParams.has("invitation_token")) return reply(row);
        if (url.searchParams.has("rfx_lane_id")) return reply([]);
        if (url.searchParams.has("vendor_id")) return reply([row]);
        if (url.searchParams.has("id")) return reply(row);
        return reply([]);
      }
      if (url.pathname.endsWith("/rfx_events")) return reply([event]);
      if (url.pathname.endsWith("/rfx_lanes")) return reply(url.searchParams.has("id") ? { ...lane, rfx_events: event } : [lane]);
      if (["contact_history", "rfx_segment_confirmations"].some((table) => url.pathname.endsWith(`/${table}`))) return reply([]);
      throw new Error(`unexpected database read: ${url.pathname}`);
    }) as typeof fetch;
    await import("../supabase/functions/rfx-bid-api/index.ts?carrier_payload_test");
    assert(handler, "handler must be installed");
    const call = async (body: Record<string, unknown>) => {
      const response = await handler!(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    };
    const leaks = (text: string) => [String(TARGET), INCUMBENT, EVENT_NOTES, OWNER, "owner-user-interno"].filter((value) => text.includes(value));

    // The carrier's own link: its lane and event in the public shape.
    const room = await call({ action: "peek_invitation", token: "token-p" });
    assertEquals(room.status, 200);
    const linkLane = room.body.invitation.rfx_lanes;
    const linkEvent = room.body.invitation.rfx_events;
    assertEquals("target_rate" in linkLane, false, "the lane's target stays internal");
    assertEquals("incumbent_vendor" in linkLane, false, "the incumbent carrier stays internal");
    assertEquals("notes" in linkEvent, false, "the event's own notes stay internal");
    assertEquals("owner_email" in linkEvent, false, "the owning account stays internal");
    assertEquals(linkLane.notes, "Cita en planta de 8 a 14 h", "the lane's notes are meant for the carrier");
    assertEquals(linkLane.origin_country, "MX", "the route keeps its countries");
    assertEquals(linkEvent.operation_start_date, "2099-01-15");
    assertEquals(leaks(JSON.stringify(room.body)).join(", "), "", "nothing internal in the carrier's room");

    // The support assistant, from the carrier's link and from the public board.
    const privateHelp = await call({ action: "bid_support_reply", token: "token-p", message: "¿Cuál es la tarifa objetivo de esta ruta?", language: "es" });
    assertEquals(privateHelp.status, 200);
    const publicHelp = await call({ action: "bid_support_reply", lane_id: "lane-p", message: "What is the target rate?", language: "en" });
    assertEquals(publicHelp.status, 200);
    assertEquals(assistantRequests.length, 2, "the assistant is asked once per question");
    for (const request of assistantRequests) {
      assertEquals(leaks(request).join(", "), "", "the assistant is never told the target or the incumbent");
    }
    assertEquals(leaks(JSON.stringify([privateHelp.body, publicHelp.body])).join(", "), "", "nothing internal in the assistant's answer");
  } finally {
    globalThis.fetch = originalFetch;
    (Deno as unknown as { serve: typeof Deno.serve }).serve = originalServe;
    for (const name of envNames) {
      if (previous[name] === undefined) Deno.env.delete(name);
      else Deno.env.set(name, previous[name]!);
    }
  }
});
