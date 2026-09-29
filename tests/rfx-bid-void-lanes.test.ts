// A lane declared void ("desierto") leaves the carrier's sight while its event
// still takes bids, its reason and who decided never reach the carrier, and it
// takes no more offers (decided 2026-09-29). The event's operation start date
// (arranque estimado) reaches the carrier. Read-only: every write fails the test.
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "") {
  if (!Object.is(actual, expected)) throw new Error(`${message} expected ${String(expected)}, received ${String(actual)}`);
}

const event = {
  id: "event-a", owner_email: "owner@example.test", rfx_id: "RFx-test", name: "Programa de prueba",
  customer: "Test Shipper", event_type: "rfx", status: "open", due_date: "2099-12-31",
  operation_start_date: "2099-01-15", bid_visibility_mode: "anonymous_rank",
};
const lane = (id: string, number: number, extra: Record<string, unknown> = {}) => ({
  id, rfx_event_id: "event-a", lane_number: number, origin: `Origen ${number}`, destination: `Destino ${number}`,
  equipment: "Dry Van", currency: "USD", ...extra,
});
const VOID = { no_award_at: "2099-01-01T00:00:00Z", no_award_reason: "motivo-interno-de-prueba", no_award_by: "decisor@example.test" };
const invitation = (id: string, token: string, laneRow: Record<string, unknown>) => ({
  id, rfx_event_id: "event-a", rfx_lane_id: laneRow.id, vendor_id: "vendor-a",
  invitation_status: "invited", invitation_token: token, invitation_token_hash: null,
  invitation_token_encrypted: null, viewed_at: "2099-01-01T00:00:00Z", currency: "USD", bid_rate: null,
  vendors: { vendor_name: "Test Carrier", domain: "carrier.example", primary_email: "test@carrier.example" },
  rfx_events: event,
  rfx_lanes: laneRow,
});
const openRow = invitation("invitation-open", "token-open", lane("lane-open", 1));
const voidRow = invitation("invitation-void", "token-void", lane("lane-void", 2, VOID));

Deno.test("a void lane stays out of the carrier's room and the board, keeps its reason internal and takes no offers", async () => {
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const envNames = ["SUPABASE_URL", "RATEWARE_SUPABASE_SERVICE_ROLE_KEY"];
  const previous = Object.fromEntries(envNames.map((name) => [name, Deno.env.get(name)]));
  let handler: ((request: Request) => Response | Promise<Response>) | undefined;
  try {
    Deno.env.set("SUPABASE_URL", "https://supabase-mock.invalid");
    Deno.env.set("RATEWARE_SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-role-test-only");
    (Deno as unknown as { serve: typeof Deno.serve }).serve = ((callback: typeof handler) => {
      handler = callback;
      return { shutdown() {} } as unknown as Deno.HttpServer;
    }) as typeof Deno.serve;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      assert(url.origin === "https://supabase-mock.invalid", "unexpected network target");
      if (method !== "GET") throw new Error(`unexpected database write: ${method} ${url.pathname}`);
      const headers = { "Content-Type": "application/json" };
      const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers });
      if (url.pathname.endsWith("/rfx_lane_vendors")) {
        if (url.searchParams.has("invitation_token_hash")) return reply([]);
        if (url.searchParams.has("invitation_token")) {
          const requested = url.searchParams.get("invitation_token");
          return reply([openRow, voidRow].find((row) => requested === `eq.${row.invitation_token}`) ?? null);
        }
        if (url.searchParams.has("vendor_id")) return reply([openRow, voidRow]);
        return reply([]);
      }
      if (url.pathname.endsWith("/rfx_events")) return reply([event]);
      if (url.pathname.endsWith("/rfx_lanes")) return reply([openRow.rfx_lanes, voidRow.rfx_lanes]);
      if (["contact_history", "rfx_segment_confirmations"].some((table) => url.pathname.endsWith(`/${table}`))) return reply([]);
      throw new Error(`unexpected database read: ${url.pathname}`);
    }) as typeof fetch;
    await import("../supabase/functions/rfx-bid-api/index.ts?void_lanes_test");
    assert(handler, "handler must be installed");
    const call = async (body: Record<string, unknown>) => {
      const response = await handler!(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    };

    // The carrier's room from a link to an open lane: the void lane isn't in the book.
    const room = await call({ action: "peek_invitation", token: "token-open" });
    assertEquals(room.status, 200);
    const invitedIds = room.body.carrier_book.invited.map((entry: { invitation_id: string }) => entry.invitation_id);
    assertEquals(invitedIds.join(","), "invitation-open", "the void lane is hidden while the event takes bids");
    assertEquals(room.body.invitation.rfx_events.operation_start_date, "2099-01-15", "the carrier sees the start date");
    assertEquals(room.body.carrier_book.invited[0].event.operation_start_date, "2099-01-15");

    // A link to the void lane itself: marked void, without its reason or who decided.
    const voidLink = await call({ action: "peek_invitation", token: "token-void" });
    assertEquals(voidLink.status, 200);
    assertEquals(voidLink.body.invitation.rfx_lanes.no_award, true);
    assertEquals("no_award_reason" in voidLink.body.invitation.rfx_lanes, false);
    assertEquals("no_award_by" in voidLink.body.invitation.rfx_lanes, false);
    for (const payload of [room.body, voidLink.body]) {
      const text = JSON.stringify(payload);
      assertEquals(text.includes("motivo-interno-de-prueba"), false, "the void reason never reaches the carrier");
      assertEquals(text.includes("decisor@example.test"), false, "who decided never reaches the carrier");
    }

    // The public board never shows a void lane, and it shows the start date.
    const board = await call({ action: "public_bid_room_board" });
    assertEquals(board.status, 200);
    assertEquals(board.body.rows.map((row: { id: string }) => row.id).join(","), "lane-open");
    assertEquals(board.body.rows[0].event.operation_start_date, "2099-01-15");

    // No offer on a void lane.
    const bid = await call({ action: "submit_bid", token: "token-void", bid_rate: 1200, language: "es" });
    assertEquals(bid.status, 409);
    assertEquals(bid.body.bid_window_closed, true);
    assert(String(bid.body.error).includes("sin adjudicar"), "the carrier reads why");
  } finally {
    globalThis.fetch = originalFetch;
    (Deno as unknown as { serve: typeof Deno.serve }).serve = originalServe;
    for (const name of envNames) {
      if (previous[name] === undefined) Deno.env.delete(name);
      else Deno.env.set(name, previous[name]!);
    }
  }
});
