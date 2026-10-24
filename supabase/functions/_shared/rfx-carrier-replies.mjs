// Carrier replies to an RFx invitation, read from Gmail threads and the Bid Room chat (added 2026-10-24).
// Pure helpers: rateware-api fetches the data, these decide what counts as a reply and whose it is.

const AUTOMATED_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?|bounce[s]?)[@+]/i;
const AUTOMATED_SUBJECT = /^(automatic reply|auto(matic)?[- ]?reply|respuesta autom[aá]tica|out of (the )?office|fuera de (la )?oficina|delivery status notification|undeliverable|mail delivery)/i;
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es", "live.com", "live.com.mx",
  "yahoo.com", "yahoo.com.mx", "icloud.com", "msn.com", "aol.com", "prodigy.net.mx", "protonmail.com"
]);

export function senderEmail(fromHeader) {
  const text = String(fromHeader || "").trim();
  const angled = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  const bare = angled ? angled[1] : (text.match(/[^\s<>"',;]+@[^\s<>"',;]+/) || [])[0];
  return bare ? bare.toLowerCase() : null;
}

export function emailDomain(email) {
  const at = String(email || "").lastIndexOf("@");
  return at > 0 ? String(email).slice(at + 1).toLowerCase() : null;
}

export function isAutomatedReply(headers = {}) {
  const from = senderEmail(headers.from) || "";
  if (AUTOMATED_SENDER.test(from)) return true;
  const autoSubmitted = String(headers["auto-submitted"] || "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers["x-autoreply"] || headers["x-autorespond"]) return true;
  const precedence = String(headers.precedence || "").toLowerCase();
  if (["bulk", "auto_reply", "junk"].includes(precedence)) return true;
  return AUTOMATED_SUBJECT.test(String(headers.subject || "").trim());
}

// Messages are Gmail metadata rows: { id, threadId, internalDate, headers } with lower-case header names.
/** @param {{ mailbox: string, messages?: any[], since?: string | null }} input */
export function carrierReplies({ mailbox, messages = [], since = null }) {
  const own = String(mailbox || "").toLowerCase();
  const sinceMs = since ? new Date(since).getTime() : 0;
  return messages
    .map((message) => ({
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId,
      at: new Date(Number(message.internalDate) || 0).toISOString(),
      at_ms: Number(message.internalDate) || 0,
      from: senderEmail(message.headers?.from),
      headers: message.headers || {}
    }))
    .filter((reply) => reply.from && reply.from !== own && reply.at_ms > sinceMs && !isAutomatedReply(reply.headers))
    .map(({ headers: _headers, at_ms: _atMs, ...reply }) => reply);
}

// Invitations: { id, vendor_id, rfx_lane_id, emails: string[], domain }. Exact address first, then a unique
// corporate domain; a free-mail domain never matches by domain alone.
/** @param {string | null | undefined} email @param {any[]} [invitations] */
export function matchInvitation(email, invitations = []) {
  const address = String(email || "").toLowerCase();
  if (!address) return null;
  const exact = invitations.filter((row) => (row.emails || []).some((value) => String(value).toLowerCase() === address));
  if (exact.length) return exact[0];
  const domain = emailDomain(address);
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return null;
  const byDomain = invitations.filter((row) =>
    String(row.domain || "").toLowerCase().replace(/^www\./, "") === domain
    || (row.emails || []).some((value) => emailDomain(value) === domain)
  );
  const vendors = new Set(byDomain.map((row) => row.vendor_id));
  return vendors.size === 1 ? byDomain[0] : null;
}

/** @param {{ invitations?: any[], threadReplies?: any[], searchReplies?: any[], chatMessages?: any[] }} input */
export function summarizeCarrierReplies({ invitations = [], threadReplies = [], searchReplies = [], chatMessages = [] }) {
  const byId = new Map(invitations.map((row) => [row.id, row]));
  const rows = new Map();
  const seen = new Set();
  const add = (invitation, channel, at, from, key) => {
    if (!invitation || (key && seen.has(key))) return;
    if (key) seen.add(key);
    const row = rows.get(invitation.id) || {
      rfx_lane_vendor_id: invitation.id,
      vendor_id: invitation.vendor_id,
      channels: [],
      count: 0,
      first_reply_at: at,
      last_reply_at: at,
      from: []
    };
    if (!row.channels.includes(channel)) row.channels.push(channel);
    if (from && !row.from.includes(from)) row.from.push(from);
    row.count += 1;
    if (at < row.first_reply_at) row.first_reply_at = at;
    if (at > row.last_reply_at) row.last_reply_at = at;
    rows.set(invitation.id, row);
  };
  for (const reply of threadReplies) add(byId.get(reply.rfx_lane_vendor_id), "email", reply.at, reply.from, reply.gmail_message_id);
  for (const reply of searchReplies) add(matchInvitation(reply.from, invitations), "email", reply.at, reply.from, reply.gmail_message_id);
  for (const message of chatMessages) {
    if (message.sender_role !== "carrier") continue;
    const candidates = invitations.filter((row) => row.vendor_id === message.vendor_id
      && (!message.rfx_lane_id || row.rfx_lane_id === message.rfx_lane_id));
    for (const invitation of candidates) add(invitation, "bid_room_chat", message.created_at, null, `chat:${message.id}:${invitation.id}`);
  }
  return [...rows.values()].sort((a, b) => a.first_reply_at.localeCompare(b.first_reply_at));
}
