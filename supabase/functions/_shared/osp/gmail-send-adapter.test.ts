import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  AmbiguousSendError,
  createGmailSendAdapter,
  KnownPreAcceptanceSendError,
} from "./gmail-send-adapter.ts";

const authorizationId = "44444444-4444-4444-8444-444444444444";
const payloadId = "33333333-3333-4333-8333-333333333333";
const mimeObjectId =
  "outbound_11111111-1111-4111-8111-111111111111_33333333-3333-4333-8333-333333333333";
const mimeBytes = new TextEncoder().encode(
  `From: carriers@xbfreight.com\r\nTo: supplier@example.test\r\nMessage-ID: <osp-${payloadId}@${
    ["xbfreight", "com"].join(".")
  }>\r\nSubject: Synthetic\r\n\r\nSynthetic body.\r\n`,
);

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function fetchFixture(input: {
  mailbox?: string;
  send?: () => Promise<Response>;
  calls?: Array<{ url: string; init?: RequestInit }>;
} = {}): typeof fetch {
  return (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    input.calls?.push({ url, init });
    if (url.endsWith("/profile")) {
      return new Response(
        JSON.stringify({
          emailAddress: input.mailbox ?? "carriers@xbfreight.com",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return await (input.send?.() ??
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "gmail-message-1",
            threadId: "gmail-thread-0",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              date: "Mon, 24 Aug 2026 18:00:00 GMT",
            },
          },
        ),
      ));
  }) as typeof fetch;
}

async function adapter(input: {
  mailbox?: string;
  bytes?: Uint8Array;
  send?: () => Promise<Response>;
  calls?: Array<{ url: string; init?: RequestInit }>;
} = {}) {
  return await createGmailSendAdapter({
    accessToken: async () => "synthetic-token",
    fetch: fetchFixture(input),
    mimeObjects: {
      read: async ({ objectId }: { objectId: string }) =>
        objectId === mimeObjectId ? (input.bytes ?? mimeBytes).slice() : null,
    },
  });
}

function request(expectedMimeSha256: string) {
  return {
    authorizationId,
    mimeObjectId,
    expectedMimeSha256,
    expectedMailbox: "carriers@xbfreight.com" as const,
    threadId: "gmail-thread-0",
  };
}

Deno.test("Gmail adapter sends only the verified frozen MIME through the Carriers profile", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const port = await adapter({ calls });
  const receipt = await port.sendFrozen(
    request(await sha256(mimeBytes)),
    AbortSignal.timeout(5_000),
  );
  assertEquals(receipt, {
    gmailMessageId: "gmail-message-1",
    gmailThreadId: "gmail-thread-0",
    acceptedAt: "2026-08-24T18:00:00.000Z",
  });
  assertEquals(calls.length, 2);
  assertEquals(calls[0].url.endsWith("/profile"), true);
  assertEquals(calls[1].url.endsWith("/messages/send"), true);
  const body = JSON.parse(String(calls[1].init?.body));
  assertEquals(Object.keys(body).sort(), ["raw", "threadId"]);
  assertEquals(body.threadId, "gmail-thread-0");
  assertEquals(
    String(calls[1].init?.headers).includes("synthetic-token"),
    false,
  );
});

Deno.test("Gmail adapter rejects mailbox substitution and changed MIME before the send call", async () => {
  await assertRejects(
    () => adapter({ mailbox: "sales@heymarksman.com" }),
    Error,
    "GMAIL_MAILBOX_MISMATCH",
  );
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const port = await adapter({
    bytes: new TextEncoder().encode("changed"),
    calls,
  });
  const expectedHash = await sha256(mimeBytes);
  await assertRejects(
    () => port.sendFrozen(request(expectedHash), AbortSignal.timeout(5_000)),
    Error,
    "GMAIL_MIME_MISMATCH",
  );
  assertEquals(
    calls.filter((call) => call.url.endsWith("/messages/send")).length,
    0,
  );
});

Deno.test("Gmail adapter distinguishes known pre-acceptance refusal from an ambiguous transport outcome", async () => {
  const expectedHash = await sha256(mimeBytes);
  const refused = await adapter({
    send: async () => new Response("", { status: 429 }),
  });
  await assertRejects(
    () => refused.sendFrozen(request(expectedHash), AbortSignal.timeout(5_000)),
    KnownPreAcceptanceSendError,
  );
  const ambiguous = await adapter({
    send: async () => {
      throw new TypeError("network");
    },
  });
  await assertRejects(
    () =>
      ambiguous.sendFrozen(request(expectedHash), AbortSignal.timeout(5_000)),
    AmbiguousSendError,
  );
});

Deno.test("Gmail adapter treats a provider thread substitution as ambiguous", async () => {
  const expectedHash = await sha256(mimeBytes);
  const port = await adapter({
    send: async () => new Response(JSON.stringify({
      id: "gmail-message-1",
      threadId: "other-thread",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        date: "Mon, 24 Aug 2026 18:00:00 GMT",
      },
    }),
  });
  await assertRejects(
    () => port.sendFrozen(request(expectedHash), AbortSignal.timeout(5_000)),
    AmbiguousSendError,
  );
});
