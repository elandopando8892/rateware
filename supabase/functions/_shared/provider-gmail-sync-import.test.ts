import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { importProviderGmailMessageById } from "./provider-gmail-sync.ts";

Deno.test("exact Gmail import replays an existing inbound message without a second persistence write", async () => {
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({
    id: "message_1",
    threadId: "thread_1",
    internalDate: String(Date.parse("2026-08-10T15:00:00.000Z")),
    labelIds: ["INBOX"],
    payload: {
      headers: [
        { name: "From", value: "Jose <jgonzalez@xbfreight.com>" },
        { name: "To", value: "supplier@example.test" },
        { name: "Cc", value: "carriers@xbfreight.com" },
        { name: "Subject", value: "PROCESO DE ALTA GRUPO SALZILLO" },
      ],
    },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  try {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: { id: "existing" }, error: null });
    chain.insert = () => { writes.push("insert"); return chain; };
    chain.update = () => { writes.push("update"); return chain; };
    const result = await importProviderGmailMessageById(
      { from: () => chain },
      "ca0a8f30-1382-4316-9bd5-cb76d9ab4920",
      {
        legal_entity_id: "11111111-1111-4111-8111-111111111111",
        mailbox_email: "carriers@xbfreight.com",
      },
      "message_1",
      "access-token",
    );
    assertEquals(result, {
      gmailMessageId: "message_1",
      gmailThreadId: "thread_1",
      subject: "PROCESO DE ALTA GRUPO SALZILLO",
      senderDomain: "xbfreight.com",
      receivedAt: "2026-08-10T15:00:00.000Z",
      inserted: false,
      attachmentCount: 0,
    });
    assertEquals(writes, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("exact historical Gmail replay accepts an archived inbound message only with the explicit archive gate", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({
    id: "message_archived",
    threadId: "thread_archived",
    internalDate: String(Date.parse("2026-08-19T15:00:00.000Z")),
    labelIds: [],
    payload: {
      headers: [
        { name: "From", value: "Jose <jgonzalez@xbfreight.com>" },
        { name: "To", value: "carriers@xbfreight.com" },
        { name: "Subject", value: "PROCESO DE ALTA GRUPO SALZILLO" },
      ],
    },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  try {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: { id: "existing" }, error: null });
    const input = [
      { from: () => chain },
      "ca0a8f30-1382-4316-9bd5-cb76d9ab4920",
      {
        legal_entity_id: "11111111-1111-4111-8111-111111111111",
        mailbox_email: "carriers@xbfreight.com",
      },
      "message_archived",
      "access-token",
    ] as const;
    await assertRejects(
      () => importProviderGmailMessageById(...input),
      Error,
      "not in the inbox",
    );
    const result = await importProviderGmailMessageById(
      ...input,
      { allowHistoricalArchive: true },
    );
    assertEquals(result.inserted, false);
    assertEquals(result.gmailMessageId, "message_archived");
    assertEquals(result.receivedAt, "2026-08-19T15:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
