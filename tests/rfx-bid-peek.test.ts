function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown) {
  if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, received ${String(actual)}`);
}
function tokenPaths(value: unknown, path = "root"): string[] {
  if (typeof value === "string" && value.includes("legacy-test-token")) return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => tokenPaths(child, `${path}.${key}`));
}

Deno.test("peek_invitation returns the existing carrier projection without any database write", async () => {
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const envNames = ["SUPABASE_URL", "RATEWARE_SUPABASE_SERVICE_ROLE_KEY"];
  const previous = Object.fromEntries(envNames.map((name) => [name, Deno.env.get(name)]));
  let handler: ((request: Request) => Response | Promise<Response>) | undefined;
  const queries: Array<{ method: string; url: string }> = [];
  const row = {
    id: "invitation-a", rfx_event_id: "event-a", rfx_lane_id: "lane-a", vendor_id: "vendor-a",
    invitation_status: "invited", invitation_token: "legacy-test-token", invitation_token_hash: null,
    invitation_token_encrypted: null, viewed_at: null, currency: "USD", bid_rate: null,
    vendors: { vendor_name: "Test Carrier", domain: "carrier.example", primary_email: "test@carrier.example" },
    rfx_events: { id: "event-a", owner_email: "owner@example.test", rfx_id: "RFx-test",
      name: "Test", customer: "Test Shipper", event_type: "spot", status: "open", due_date: "2026-12-31" },
    rfx_lanes: { id: "lane-a", rfx_event_id: "event-a", lane_number: 1,
      origin: "Test Origin", destination: "Test Destination", equipment: "Dry Van", currency: "USD" },
  };
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
      queries.push({ method, url: url.href });
      assert(url.origin === "https://supabase-mock.invalid", "unexpected network target");
      if (method !== "GET") throw new Error(`unexpected database write: ${method}`);
      const headers = { "Content-Type": "application/json" };
      if (url.pathname.endsWith("/rfx_lane_vendors") && url.searchParams.has("invitation_token_hash")) {
        return new Response(JSON.stringify([]), { status: 200, headers });
      }
      if (url.pathname.endsWith("/rfx_lane_vendors") && url.searchParams.has("invitation_token")) {
        return new Response(JSON.stringify(row), { status: 200, headers });
      }
      if (url.pathname.endsWith("/rfx_lane_vendors") && url.searchParams.has("rfx_lane_id")) {
        return new Response(JSON.stringify([]), { status: 200, headers });
      }
      if (url.pathname.endsWith("/rfx_lane_vendors") && url.searchParams.has("vendor_id")) {
        return new Response(JSON.stringify([row]), { status: 200, headers });
      }
      if (["rfx_lanes", "contact_history", "rfx_segment_confirmations"].some((table) =>
        url.pathname.endsWith(`/${table}`))) {
        return new Response(JSON.stringify([]), { status: 200, headers });
      }
      throw new Error(`unexpected database read: ${url.pathname}`);
    }) as typeof fetch;
    await import("../supabase/functions/rfx-bid-api/index.ts?peek_contract_test");
    assert(handler, "handler must be installed");
    const response = await handler(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "peek_invitation", token: "legacy-test-token", refresh_only: true }),
    }));
    assertEquals(response.status, 200);
    const payload = await response.json();
    assertEquals(payload.invitation.id, "invitation-a");
    assertEquals(tokenPaths(payload).join(","), "");
    assertEquals(payload.current_book_row.invitation_id, "invitation-a");
    assertEquals(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
    const fullResponse = await handler(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "peek_invitation", token: "legacy-test-token" }),
    }));
    assertEquals(fullResponse.status, 200);
    const fullPayload = await fullResponse.json();
    assertEquals(fullPayload.carrier_book.invited[0].invitation_id, "invitation-a");
    assertEquals(tokenPaths(fullPayload).join(","), "");
    assertEquals("bid_history" in fullPayload, false);
    assertEquals("segment_confirmations" in fullPayload, false);
    assertEquals(fullResponse.headers.get("Cache-Control"), "private, no-store, max-age=0");
    row.invitation_status = "revoked";
    const revoked = await handler(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "peek_invitation", token: "legacy-test-token" }),
    }));
    assertEquals(revoked.status, 404);
    assert(queries.length >= 2);
    assert(queries.every((query) => query.method === "GET"));
  } finally {
    globalThis.fetch = originalFetch;
    (Deno as unknown as { serve: typeof Deno.serve }).serve = originalServe;
    for (const name of envNames) {
      if (previous[name] === undefined) Deno.env.delete(name);
      else Deno.env.set(name, previous[name]!);
    }
  }
});
