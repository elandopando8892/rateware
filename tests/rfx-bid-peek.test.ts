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
  const envNames = ["SUPABASE_URL", "RATEWARE_SUPABASE_SERVICE_ROLE_KEY", "BID_DEADLINE_UTC_OFFSET"];
  const previous = Object.fromEntries(envNames.map((name) => [name, Deno.env.get(name)]));
  let handler: ((request: Request) => Response | Promise<Response>) | undefined;
  const queries: Array<{ method: string; url: string }> = [];
  const row = {
    id: "invitation-a", rfx_event_id: "event-a", rfx_lane_id: "lane-a", vendor_id: "vendor-a",
    invitation_status: "invited", invitation_token: "legacy-test-token", invitation_token_hash: null,
    invitation_token_encrypted: null, viewed_at: null, currency: "USD", bid_rate: null,
    vendors: { vendor_name: "Test Carrier", domain: "carrier.example", primary_email: "test@carrier.example" },
    rfx_events: { id: "event-a", owner_email: "owner@example.test", rfx_id: "RFx-test",
      name: "Test", customer: "Test Shipper", event_type: "spot", status: "open", due_date: "2099-12-31" },
    rfx_lanes: { id: "lane-a", rfx_event_id: "event-a", lane_number: 1,
      origin: "Test Origin", destination: "Test Destination", equipment: "Dry Van", currency: "USD" },
  };
  const foreignRow = {
    ...row, id: "invitation-b", vendor_id: "vendor-b",
    invitation_token: "legacy-test-token-b",
    vendors: { vendor_name: "Foreign Carrier", domain: "foreign.example", primary_email: "foreign@carrier.example" },
  };
  const encryptedSameVendorRow = {
    ...row, id: "invitation-a2", rfx_lane_id: "lane-a2",
    invitation_token: null, invitation_token_hash: "opaque-test-hash",
    invitation_token_encrypted: "opaque-test-ciphertext",
    rfx_lanes: { ...row.rfx_lanes, id: "lane-a2", lane_number: 2 },
  };
  const unsentRow = { ...row, id: "invitation-unsent" };
  const draftRow = { ...row, id: "invitation-draft", invitation_status: "drafted" };
  const expiredRow = { ...row, id: "invitation-expired", rfx_events: { ...row.rfx_events, due_date: "2000-01-01" } };
  let receiptsAvailable = true;
  let receiptReadFailure = false;
  let foreignReceipts = false;
  const sentAt = new Date(Date.now() - 60_000).toISOString();
  const receipts = [row, encryptedSameVendorRow, foreignRow, draftRow, expiredRow].map((entry) => ({
    id: `receipt-${entry.id}`, owner_email: entry.rfx_events.owner_email, vendor_id: entry.vendor_id,
    rfx_event_id: entry.rfx_event_id, rfx_lane_vendor_id: entry.id,
    status: "sent", channel: "email", provider: "gmail", provider_message_id: "synthetic-provider-receipt",
    sent_at: sentAt, delivery_status: "sent", provider_response_status: "accepted",
  }));
  try {
    Deno.env.set("SUPABASE_URL", "https://supabase-mock.invalid");
    Deno.env.set("RATEWARE_SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-role-test-only");
    Deno.env.set("BID_DEADLINE_UTC_OFFSET", "+02:00");
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
        const requested = url.searchParams.get("invitation_token");
        const found = [row, foreignRow].find((candidate) => requested === `eq.${candidate.invitation_token}`);
        return new Response(JSON.stringify(found || null), { status: 200, headers });
      }
      if (url.pathname.endsWith("/rfx_lane_vendors") && url.searchParams.has("rfx_lane_id")) {
        return new Response(JSON.stringify([]), { status: 200, headers });
      }
      if (url.pathname.endsWith("/rfx_lane_vendors") && url.searchParams.has("vendor_id")) {
        const vendorId = url.searchParams.get("vendor_id");
        const ownerEmail = url.searchParams.get("rfx_events.owner_email");
        return new Response(JSON.stringify([row, encryptedSameVendorRow, foreignRow, unsentRow, draftRow, expiredRow].filter((candidate) =>
          vendorId === `eq.${candidate.vendor_id}` && ownerEmail === `eq.${candidate.rfx_events.owner_email}`
        )), { status: 200, headers });
      }
      if (url.pathname.endsWith("/outreach_messages")) {
        assertEquals(url.searchParams.get("owner_email"), "eq.owner@example.test");
        assert(url.searchParams.has("vendor_id"), "receipt read must be vendor bound");
        assert(url.searchParams.has("rfx_event_id"), "receipt read must be event bound");
        if (receiptReadFailure) return new Response(JSON.stringify({ message: "private-db-detail" }), { status: 500, headers });
        const scoped = receiptsAvailable ? receipts.filter((receipt) => url.searchParams.get("vendor_id") === `eq.${receipt.vendor_id}`) : [];
        return new Response(JSON.stringify(foreignReceipts ? scoped.map((receipt) => ({ ...receipt, vendor_id: "carrier-other" })) : scoped), { status: 200, headers });
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
    assertEquals(payload.delivery_evidence.contractVersion, "rateware-private-book-sent.v1");
    assertEquals(payload.delivery_evidence.sentOnly, true);
    assertEquals(payload.invitation.expires_at, "2099-12-31T21:59:59.000Z");
    assertEquals(payload.current_book_row.expires_at, payload.invitation.expires_at);
    assertEquals(payload.invitation.delivery_receipt.basis, "provider_accepted");
    assertEquals(JSON.stringify(payload).includes("synthetic-provider-receipt"), false);
    assertEquals(tokenPaths(payload).join(","), "");
    assertEquals(/invitation_token(?:_hash|_encrypted)?/.test(JSON.stringify(payload)), false);
    assertEquals(payload.current_book_row.invitation_id, "invitation-a");
    assertEquals(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
    const fullResponse = await handler(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "peek_invitation", token: "legacy-test-token" }),
    }));
    assertEquals(fullResponse.status, 200);
    const fullPayload = await fullResponse.json();
    assertEquals(fullPayload.carrier_book.invited[0].invitation_id, "invitation-a");
    assertEquals(fullPayload.carrier_book.invited.length, 2);
    assertEquals(fullPayload.carrier_book.summary.invited, 2);
    assertEquals(fullPayload.delivery_evidence.source, "outreach_messages");
    assertEquals(fullPayload.carrier_book.invited[0].expires_at, fullPayload.invitation.expires_at);
    for (const id of [unsentRow.id, draftRow.id, expiredRow.id]) assertEquals(JSON.stringify(fullPayload).includes(id), false);
    assert(fullPayload.carrier_book.invited.some((entry: { invitation_id: string }) =>
      entry.invitation_id === "invitation-a2"), "encrypted-token invitation must remain in a tokenless peek");
    assertEquals(JSON.stringify(fullPayload).includes("opaque-test-ciphertext"), false);
    assertEquals(JSON.stringify(fullPayload).includes("opaque-test-hash"), false);
    assertEquals(fullPayload.carrier_book.open_not_invited.length, 0);
    assertEquals(fullPayload.carrier_book.summary.not_invited_open, 0);
    assertEquals(queries.some((query) => new URL(query.url).pathname.endsWith("/rfx_lanes")), false);
    assertEquals(tokenPaths(fullPayload).join(","), "");
    assertEquals(/invitation_token(?:_hash|_encrypted)?/.test(JSON.stringify(fullPayload)), false);
    assertEquals("bid_history" in fullPayload, false);
    assertEquals("segment_confirmations" in fullPayload, false);
    assertEquals(fullResponse.headers.get("Cache-Control"), "private, no-store, max-age=0");
    const foreignResponse = await handler(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "peek_invitation", token: "legacy-test-token-b" }),
    }));
    assertEquals(foreignResponse.status, 200);
    const foreignPayload = await foreignResponse.json();
    assertEquals(foreignPayload.invitation.id, "invitation-b");
    assertEquals(foreignPayload.carrier_book.invited.length, 1);
    assertEquals(foreignPayload.carrier_book.invited[0].invitation_id, "invitation-b");
    assertEquals(tokenPaths(foreignPayload).join(","), "");
    const probe = async (refresh_only = false) => await handler!(new Request("https://rateware.example/functions/v1/rfx-bid-api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "peek_invitation", token: "legacy-test-token", refresh_only }),
    }));
    receiptsAvailable = false;
    for (const refresh of [false, true]) assertEquals((await probe(refresh)).status, 404);
    receiptsAvailable = true;
    foreignReceipts = true;
    assertEquals((await probe()).status, 404);
    foreignReceipts = false;
    receiptReadFailure = true;
    const unavailable = await probe();
    assertEquals(unavailable.status, 503);
    assertEquals((await unavailable.json()).code, "PRIVATE_DELIVERY_EVIDENCE_UNAVAILABLE");
    receiptReadFailure = false;
    row.invitation_status = "drafted";
    assertEquals((await probe()).status, 404);
    row.invitation_status = "invited";
    row.rfx_events.due_date = "2000-01-01";
    assertEquals((await probe()).status, 404);
    row.rfx_events.due_date = "2099-12-31";
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
