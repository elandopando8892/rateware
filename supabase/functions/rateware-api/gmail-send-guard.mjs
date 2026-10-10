// Uses the existing connection metadata and compare-and-swap; no schema change.
export const SEND_SPACING_MS = 1500;
export const SEND_WINDOW_MS = 90_000;
export const SEND_LEASE_MS = 180_000;
export function quotaPause(status, data, retryAfter, now = Date.now()) {
  const diagnostic = JSON.stringify(data || {});
  if (status !== 429 && !(status === 403 && /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quota|rate limit/i.test(diagnostic))) return null;
  const seconds = Number(retryAfter);
  const headerUntil = retryAfter && Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(retryAfter || "");
  return new Date(Math.max(now + 300_000, Number.isFinite(headerUntil) ? headerUntil : 0)).toISOString();
}
const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
async function readConnection(db, owner, sender) {
  const result = await db.from("gmail_mailbox_connections").select("id,metadata,updated_at")
    .eq("owner_email", owner).eq("mailbox_email", sender).eq("status", "connected").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Gmail connection is unavailable.");
  return result.data;
}
async function saveConnection(db, owner, row, metadata, now) {
  let query = db.from("gmail_mailbox_connections").update({ metadata, updated_at: new Date(now).toISOString() })
    .eq("id", row.id).eq("owner_email", owner).eq("status", "connected");
  query = row.updated_at == null ? query.is("updated_at", null) : query.eq("updated_at", row.updated_at);
  // Compare the JSON too: even updates with the same timestamp cannot take two leases.
  query = row.metadata == null ? query.is("metadata", null) : query.eq("metadata", JSON.stringify(row.metadata));
  const saved = await query.select("id").maybeSingle();
  if (saved.error) throw saved.error;
  return Boolean(saved.data);
}
export async function acquireSendLease(db, owner, sender, now = Date.now(), id = crypto.randomUUID()) {
  const row = await readConnection(db, owner, sender), metadata = record(row.metadata);
  const guard = record(metadata.outreach_send_guard);
  if (Date.parse(guard.cooldown_until || "") > now) throw new Error("Gmail quota pause until " + guard.cooldown_until + ". Review the queue before approving again.");
  if (Date.parse(guard.lease_until || "") > now) throw new Error("Another Gmail delivery is in progress. Wait before approving again.");
  const next = { ...guard, lease_id: id, lease_until: new Date(now + SEND_LEASE_MS).toISOString() };
  if (!await saveConnection(db, owner, row, { ...metadata, outreach_send_guard: next }, now)) throw new Error("Gmail connection changed concurrently. Refresh the queue before approving again.");
  return { id, sender };
}
export async function finishSendLease(db, owner, lease, cooldownUntil, now = Date.now()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readConnection(db, owner, lease.sender), metadata = record(row.metadata), guard = record(metadata.outreach_send_guard);
    if (guard.lease_id !== lease.id) throw new Error("Gmail send lease changed; do not retry automatically.");
    const next = { ...guard, lease_id: null, lease_until: null, cooldown_until: cooldownUntil || guard.cooldown_until || null };
    if (await saveConnection(db, owner, row, { ...metadata, outreach_send_guard: next }, now)) return;
  }
  throw new Error("Gmail delivery pause could not be saved; do not retry automatically.");
}
