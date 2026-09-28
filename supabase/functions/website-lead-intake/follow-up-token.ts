const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function followUpKey(secret: string) {
  if (secret.trim().length < 32) throw new Error("Follow-up encryption material is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${secret}:website-follow-up:v1`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const RECEIPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createFollowUpToken(secret: string, receiptId: string, now = Date.now(), ttlMs = 30 * 24 * 60 * 60 * 1000) {
  if (!RECEIPT_ID_PATTERN.test(receiptId)) throw new Error("Follow-up receipt is invalid.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = encoder.encode(JSON.stringify({ v: 1, receipt_id: receiptId, exp: now + ttlMs }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await followUpKey(secret), payload);
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function verifyFollowUpToken(secret: string, token: string, now = Date.now()) {
  try {
    const [version, ivText, ciphertextText, extra] = String(token || "").split(".");
    if (version !== "v1" || !ivText || !ciphertextText || extra) return { ok: false as const, code: "follow_up_invalid" as const };
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivText) },
      await followUpKey(secret),
      fromBase64Url(ciphertextText),
    );
    const payload = JSON.parse(decoder.decode(plaintext));
    if (payload?.v !== 1 || !RECEIPT_ID_PATTERN.test(String(payload.receipt_id || "")) || !Number.isFinite(payload.exp)) {
      return { ok: false as const, code: "follow_up_invalid" as const };
    }
    if (payload.exp <= now) return { ok: false as const, code: "follow_up_expired" as const };
    return { ok: true as const, receiptId: String(payload.receipt_id), expiresAt: Number(payload.exp) };
  } catch {
    return { ok: false as const, code: "follow_up_invalid" as const };
  }
}
