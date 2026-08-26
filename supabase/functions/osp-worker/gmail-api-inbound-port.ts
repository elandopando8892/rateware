import type { GmailInboundPort } from './gmail-inbound-port.ts';

const GMAIL_ID = /^[A-Za-z0-9_-]{1,256}$/;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export function createGmailApiInboundPort(options: { accessToken: (signal?: AbortSignal) => Promise<string>; maxBytes?: number }): GmailInboundPort {
  const maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  return Object.freeze({
    async getMessage(messageId: string, signal?: AbortSignal) {
      if (!GMAIL_ID.test(messageId)) throw new Error('INVALID_GMAIL_MESSAGE_ID');
      const token = await options.accessToken(signal);
      if (!token || token.trim() !== token || /[\r\n]/.test(token)) throw new Error('GMAIL_TEMPORARY');
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=raw`, { method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok || response.redirected || response.type === 'opaqueredirect') throw new Error(response.status >= 500 || response.status === 429 || response.status === 302 ? 'GMAIL_TEMPORARY' : 'INVALID_GMAIL_MESSAGE');
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (!Number.isSafeInteger(declared) || declared > maxBytes * 2) throw new Error('GMAIL_SOURCE_TOO_LARGE');
      const body = await response.text();
      if (body.length > maxBytes * 2) throw new Error('GMAIL_SOURCE_TOO_LARGE');
      let payload: unknown; try { payload = JSON.parse(body); } catch { throw new Error('INVALID_GMAIL_MESSAGE'); }
      if (!payload || typeof payload !== 'object') throw new Error('INVALID_GMAIL_MESSAGE');
      const value = payload as { id?: unknown; threadId?: unknown; raw?: unknown; internalDate?: unknown };
      if (value.id !== messageId || typeof value.threadId !== 'string' || !GMAIL_ID.test(value.threadId) || typeof value.raw !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value.raw)) throw new Error('INVALID_GMAIL_MESSAGE');
      const encoded = value.raw.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      if (bytes.byteLength > maxBytes) throw new Error('GMAIL_SOURCE_TOO_LARGE');
      const time = typeof value.internalDate === 'string' && /^\d+$/.test(value.internalDate) ? new Date(Number(value.internalDate)).toISOString() : new Date(0).toISOString();
      return Object.freeze({ gmailMessageId: value.id, gmailThreadId: value.threadId, rawMime: bytes, receivedAt: time });
    },
  });
}
