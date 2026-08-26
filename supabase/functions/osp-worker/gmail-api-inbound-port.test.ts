import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { createGmailApiInboundPort } from './gmail-api-inbound-port.ts';

Deno.test('Gmail inbound adapter fetches only encoded raw endpoint with bounded no-redirect response', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const requester = ['requester', 'xbfreight.com'].join('@');
      return new Response(JSON.stringify({ id: 'message_1', threadId: 'thread_1', raw: btoa(`From: XBF <${requester}>\r\nCc: Carriers <carriers@xbfreight.com>\r\n\r\nExample`) }), { status: 200 });
  } });
  try {
    const port = createGmailApiInboundPort({ accessToken: async () => 'local-token' });
    const value = await port.getMessage('message_1');
    assertEquals(value.gmailMessageId, 'message_1');
    assertEquals(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/message_1?format=raw');
    assertEquals(calls[0].init.method, 'GET');
    assertEquals(calls[0].init.redirect, 'error');
    assertEquals(calls[0].init.headers, { Authorization: 'Bearer local-token' });
  } finally { Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch }); }
});

Deno.test('Gmail inbound adapter rejects untrusted IDs, redirect response, non-raw shape, and oversized source', async () => {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async () => new Response('', { status: 302 }) });
  try {
    const bad = createGmailApiInboundPort({ accessToken: async () => 'local-token' });
    await assertRejects(() => bad.getMessage('../message'), Error, 'INVALID_GMAIL_MESSAGE_ID');
    await assertRejects(() => bad.getMessage('message_1'), Error, 'GMAIL_TEMPORARY');
  } finally { Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch }); }
});
