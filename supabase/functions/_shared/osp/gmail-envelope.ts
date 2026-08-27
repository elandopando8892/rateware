import PostalMime from 'postalMime';

export type ParsedCopiedRequest = { senderDomain: string; supplierDomain: string; to: readonly string[]; cc: readonly string[]; subject: string; safeBody: string; attachments: readonly { bytes: Uint8Array; contentType: string }[]; requirementTokens: readonly string[]; applicationReference: string | null };

function header(raw: string, name: string): string | null {
  const prefix = `${name.toLowerCase()}:`;
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().startsWith(prefix)) continue;
    const values = [lines[index].slice(prefix.length).trim()];
    while (index + 1 < lines.length && /^[ \t]/.test(lines[index + 1])) values.push(lines[++index].trim());
    return values.join(' ').trim();
  }
  return null;
}
function textTokens(value: string): readonly string[] {
  return Object.freeze([...new Set(value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].sort());
}

function attachmentBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

export async function parseCopiedRequest(rawMime: Uint8Array): Promise<ParsedCopiedRequest> {
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(rawMime);
  const from = header(raw, 'from'); const to = header(raw, 'to'); const cc = header(raw, 'cc'); const subject = header(raw, 'subject') ?? '';
  if (!from || !/\r?\n\r?\n/.test(raw)) throw new Error('MALFORMED_MIME');
  const parsed = await new PostalMime().parse(rawMime);
  const sender = parsed.from?.address?.trim().toLowerCase();
  const senderDomain = sender?.split('@')[1] ?? '';
  const toMailboxes = Array.isArray(parsed.to) ? parsed.to.map((mailbox) => typeof mailbox?.address === 'string' ? mailbox.address.trim().toLowerCase() : '').filter(Boolean) : [];
  const supplierAddress = toMailboxes.find((address) => address.split('@')[1] !== 'xbfreight.com');
  const supplierDomain = supplierAddress?.split('@')[1] ?? '';
  if (!to || !cc || !supplierDomain || supplierDomain === 'xbfreight.com') throw new Error('UNQUALIFIED_GMAIL_MESSAGE');
  const parsedCc = Array.isArray(parsed.cc) ? parsed.cc.map((mailbox) => typeof mailbox?.address === 'string' ? mailbox.address.trim().toLowerCase() : '').filter(Boolean) : [];
  if (senderDomain !== 'xbfreight.com' || !parsedCc.includes('carriers@xbfreight.com')) throw new Error('UNQUALIFIED_GMAIL_MESSAGE');
  const text = typeof parsed.text === 'string' ? parsed.text : '';
  const safeBody = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000);
  const attachments = (Array.isArray(parsed.attachments) ? parsed.attachments : []).map((attachment) => ({ bytes: attachmentBytes(attachment.content), contentType: typeof attachment.mimeType === 'string' ? attachment.mimeType : 'application/octet-stream' }));
  const app = `${subject} ${safeBody}`.match(/\b(?:application|account)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{3,})\b/i)?.[1] ?? null;
  return Object.freeze({ senderDomain, supplierDomain, to: Object.freeze(toMailboxes), cc: Object.freeze(parsedCc), subject, safeBody, attachments: Object.freeze(attachments), requirementTokens: textTokens(`${subject} ${safeBody}`), applicationReference: app });
}
