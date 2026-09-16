export const INTERNAL_REQUEST_VERSION = "rateware-internal-request.v1";

type Row = Record<string, unknown>;

export class ShipmentEventAuthorizationError extends Error {
  constructor(public code: string) { super(code); }
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Row).sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Row)[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function equalHex(left: unknown, right: string) {
  if (typeof left !== "string" || left.length !== right.length || !/^[a-f0-9]+$/.test(left)) return false;
  let mismatch = 0;
  for (let index = 0; index < right.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyShipmentEventEnvelope(envelope: Row, {
  sharedSecret,
  expectedKeyId,
  now = () => new Date(),
}: { sharedSecret: string; expectedKeyId: string; now?: () => Date }) {
  if (sharedSecret.length < 32 || !expectedKeyId) throw new ShipmentEventAuthorizationError("SHIPMENT_EVENT_INGEST_NOT_CONFIGURED");
  const allowed = ["audience", "body", "contractVersion", "expiresAt", "issuedAt", "issuer", "keyId", "requestId", "signature"];
  if (Object.keys(envelope).sort().join() !== allowed.sort().join()
    || envelope.contractVersion !== INTERNAL_REQUEST_VERSION
    || envelope.issuer !== "marksman-loads" || envelope.audience !== "rateware"
    || envelope.keyId !== expectedKeyId || typeof envelope.requestId !== "string" || !envelope.requestId.trim()
    || !envelope.body || typeof envelope.body !== "object" || Array.isArray(envelope.body)) {
    throw new ShipmentEventAuthorizationError("INVALID_INTERNAL_AUTHORIZATION");
  }
  const issued = Date.parse(String(envelope.issuedAt || ""));
  const expires = Date.parse(String(envelope.expiresAt || ""));
  const current = now().getTime();
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued
    || expires - issued > 5 * 60_000 || issued > current + 30_000 || expires < current) {
    throw new ShipmentEventAuthorizationError("INTERNAL_AUTHORIZATION_EXPIRED");
  }
  const { signature: _signature, ...unsigned } = envelope;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sharedSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(stableStringify(unsigned))));
  if (!equalHex(envelope.signature, expected)) throw new ShipmentEventAuthorizationError("INVALID_INTERNAL_SIGNATURE");
  return structuredClone(envelope);
}
