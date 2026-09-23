function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// The module reads its configuration at import time.
Deno.env.set("GOOGLE_CLIENT_ID", "client-id");
Deno.env.set("GOOGLE_CLIENT_SECRET", "client-secret");
Deno.env.set("GMAIL_TOKEN_ENCRYPTION_KEY", "test-encryption-key");
Deno.env.set("GOOGLE_CHAT_ALLOWED_ACCOUNT", "sales@example.com");
Deno.env.delete("GOOGLE_CHAT_WEBHOOK_URL");
const { bidRoomGoogleThreadKey, googleChatAccessToken, syncBidRoomMessageToGoogleChat } = await import("../supabase/functions/_shared/bid-room-google-chat.ts");

async function tokenKey(usages: KeyUsage[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test-encryption-key"));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(["encrypt"]), new TextEncoder().encode(value));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

async function decryptToken(value: string) {
  const [, ivText, ciphertextText] = value.split(":");
  const bytes = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(ivText) }, await tokenKey(["decrypt"]), bytes(ciphertextText));
  return new TextDecoder().decode(plain);
}

type Row = Record<string, unknown>;

// Just enough of the Supabase query builder for the module: filtered reads
// through maybeSingle() and awaited updates.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    tables,
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let patch: Row | null = null;
      const matches = () => (tables[table] || []).filter((row) =>
        filters.every(([op, key, value]) => (op === "eq" ? row[key] === value : row[key] !== value))
      );
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => (filters.push(["eq", key, value]), builder),
        neq: (key: string, value: unknown) => (filters.push(["neq", key, value]), builder),
        update: (values: Row) => ((patch = values), builder),
        maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          if (patch) for (const row of matches()) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

type FetchCall = { url: string; init: RequestInit };

function stubFetch(respond: (url: string) => Response) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return Promise.resolve(respond(url));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const thread = () => ({
  id: "thread-1",
  owner_email: "org:test",
  title: "RFx-1 | Private: ZZ Carrier",
  thread_type: "carrier_private",
  google_chat_thread_key: "rateware-bid-room-thread-1",
  google_chat_thread_name: "spaces/S/threads/T1"
});

const message = () => ({
  id: "message-1",
  owner_email: "org:test",
  sender_name: "ZZ Carrier",
  body: "Follow-up on support ticket ticket-1:\nAny news?"
});

async function connection(overrides: Row = {}) {
  return {
    owner_email: "org:test",
    account_email: "sales@example.com",
    status: "connected",
    default_space_name: "spaces/S",
    access_token_encrypted: await encryptToken("live-token"),
    refresh_token_encrypted: await encryptToken("refresh-token"),
    token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides
  };
}

Deno.test("a message is posted as a reply in the ticket's existing Google Chat thread", async () => {
  const supabase = fakeSupabase({
    google_chat_connections: [await connection()],
    bid_room_chat_messages: [message()],
    bid_room_chat_threads: [thread()]
  });
  const fetchStub = stubFetch(() => Response.json({ name: "spaces/S/messages/M1", thread: { name: "spaces/S/threads/T1" } }));
  try {
    const result = await syncBidRoomMessageToGoogleChat(supabase, thread(), message());
    assert(result.status === "synced", `expected synced, got ${result.status}`);
    assert(fetchStub.calls.length === 1, "only the Chat API should be called while the token is valid");
    const [call] = fetchStub.calls;
    assert(call.url === "https://chat.googleapis.com/v1/spaces/S/messages?messageReplyOption=REPLY_MESSAGE_OR_FAIL", `unexpected url ${call.url}`);
    assert((call.init.headers as Record<string, string>).Authorization === "Bearer live-token", "must use the stored access token");
    const sent = JSON.parse(String(call.init.body));
    assert(sent.thread.name === "spaces/S/threads/T1", "must reply in the ticket's thread");
    assert(sent.text === "*RFx-1 | Private: ZZ Carrier*\nZZ Carrier: Follow-up on support ticket ticket-1:\nAny news?", `unexpected text ${sent.text}`);
    const stored = supabase.tables.bid_room_chat_messages[0];
    assert(stored.google_chat_sync_status === "synced" && stored.google_chat_message_name === "spaces/S/messages/M1", "the message row must record the sync");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("an expired access token is refreshed and stored encrypted before posting", async () => {
  const supabase = fakeSupabase({
    google_chat_connections: [await connection({ token_expires_at: new Date(Date.now() - 60_000).toISOString() })],
    bid_room_chat_messages: [message()],
    bid_room_chat_threads: [thread()]
  });
  const fetchStub = stubFetch((url) => url.startsWith("https://oauth2.googleapis.com/token")
    ? Response.json({ access_token: "fresh-token", expires_in: 3600 })
    : Response.json({ name: "spaces/S/messages/M2" }));
  try {
    const result = await syncBidRoomMessageToGoogleChat(supabase, thread(), message());
    assert(result.status === "synced", `expected synced, got ${result.status}`);
    const [refresh, post] = fetchStub.calls;
    assert(new URLSearchParams(String(refresh.init.body)).get("refresh_token") === "refresh-token", "must refresh with the stored refresh token");
    assert((post.init.headers as Record<string, string>).Authorization === "Bearer fresh-token", "must post with the refreshed token");
    const saved = supabase.tables.google_chat_connections[0];
    assert(await decryptToken(String(saved.access_token_encrypted)) === "fresh-token", "the refreshed token must be stored encrypted");
    assert(new Date(String(saved.token_expires_at)).getTime() > Date.now(), "the new expiry must be in the future");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("a rejected post is recorded as an error without throwing", async () => {
  const supabase = fakeSupabase({
    google_chat_connections: [await connection()],
    bid_room_chat_messages: [message()],
    bid_room_chat_threads: [thread()]
  });
  const fetchStub = stubFetch(() => Response.json({ error: { message: "Permission denied." } }, { status: 403 }));
  try {
    const result = await syncBidRoomMessageToGoogleChat(supabase, thread(), message());
    assert(result.status === "error", `expected error, got ${result.status}`);
    assert(supabase.tables.bid_room_chat_messages[0].google_chat_sync_status === "error", "the message row must show the failure");
    assert(supabase.tables.google_chat_connections[0].last_error === "Permission denied.", "the connection must keep Google's reason");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("without a connected account or webhook nothing is sent", async () => {
  const supabase = fakeSupabase({ google_chat_connections: [], bid_room_chat_messages: [message()], bid_room_chat_threads: [thread()] });
  const fetchStub = stubFetch(() => Response.json({}));
  try {
    const result = await syncBidRoomMessageToGoogleChat(supabase, thread(), message());
    assert(result.status === "not_configured", `expected not_configured, got ${result.status}`);
    assert(fetchStub.calls.length === 0, "nothing may be sent");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("a message without a sender uses the caller's label: Carrier by default, Rateware for the team", async () => {
  const unnamed = () => ({ id: "message-1", owner_email: "org:test", body: "Hola" });
  for (const [options, label] of [[undefined, "Carrier"], [{ defaultSender: "Rateware" }, "Rateware"]] as const) {
    const supabase = fakeSupabase({
      google_chat_connections: [await connection()],
      bid_room_chat_messages: [unnamed()],
      bid_room_chat_threads: [thread()]
    });
    const fetchStub = stubFetch(() => Response.json({ name: "spaces/S/messages/M3" }));
    try {
      await syncBidRoomMessageToGoogleChat(supabase, thread(), unnamed(), {}, options);
      const sent = JSON.parse(String(fetchStub.calls[0].init.body));
      assert(sent.text === `*RFx-1 | Private: ZZ Carrier*\n${label}: Hola`, `expected the ${label} label, got ${sent.text}`);
    } finally {
      fetchStub.restore();
    }
  }
});

Deno.test("sync errors never carry credentials back to the caller", async () => {
  const supabase = fakeSupabase({
    google_chat_connections: [await connection()],
    bid_room_chat_messages: [message()],
    bid_room_chat_threads: [thread()]
  });
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("upstream rejected Authorization: Bearer ya29.secret-token for ?access_token=abc123"))) as typeof fetch;
  try {
    const result = await syncBidRoomMessageToGoogleChat(supabase, thread(), message());
    assert(result.status === "error", `expected error, got ${result.status}`);
    assert(!/ya29\.secret-token|abc123/.test(String(result.error)), `credentials leaked: ${result.error}`);
    assert(/\[redacted\]/.test(String(result.error)), `expected a redaction marker, got ${result.error}`);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("thread keys stay stable, because they decide which Chat thread a message joins", () => {
  assert(bidRoomGoogleThreadKey("e1", "carrier_private", "l1", "v1") === "rateware-bid-room-e1-carrier_private-l1-v1", "carrier thread key changed");
  assert(bidRoomGoogleThreadKey("e1", "event_group", null, null) === "rateware-bid-room-e1-event_group-event-group", "event thread key changed");
});

Deno.test("without a connected Google account the token lookup explains what to connect", async () => {
  const supabase = fakeSupabase({ google_chat_connections: [] });
  let message = "";
  try {
    await googleChatAccessToken(supabase, "org:test");
  } catch (error) {
    message = (error as Error).message;
  }
  assert(message === "Connect sales@example.com in Settings before using Google Chat.", `unexpected: ${message}`);
});
