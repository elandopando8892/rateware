// Exact-message approval envelope for the existing WhatsApp delivery queue.
// Dependency-free: relies only on Web Crypto (`crypto.subtle`) and TextEncoder.
export const WHATSAPP_APPROVAL_CONTRACT = 'bidware.whatsapp-approval.v1';
export const WHATSAPP_APPROVAL_TTL_MS = 15 * 60 * 1000;

const REQUIRED = 'OUTREACH_APPROVAL_REQUIRED';
const EXPIRED = 'OUTREACH_APPROVAL_EXPIRED';
const CONFLICT = 'OUTREACH_VERSION_CONFLICT';
const HMAC_DOMAIN = 'bidware.whatsapp-approval.v1/hmac';
const APPROVAL_KEYS = ['contract', 'expires_at', 'fingerprint', 'issued_at', 'signature'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_DEPTH = 64;

function fail(prefix, detail) {
  const error = new Error(`${prefix}: ${detail}`);
  error.code = '409';
  return error;
}

// Independent JSON-only copy. Reads only own data descriptors, so getters are never invoked.
function copyJson(value, stack, depth) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw fail(REQUIRED, 'snapshot contains a non-finite number');
    return value;
  }
  if (typeof value !== 'object') throw fail(REQUIRED, 'snapshot contains a non-JSON value');
  if (depth > MAX_DEPTH) throw fail(REQUIRED, 'snapshot is nested too deeply');
  if (stack.has(value)) throw fail(REQUIRED, 'snapshot is cyclic');
  stack.add(value);
  try {
    const proto = Object.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value)) {
      if (proto !== Array.prototype) throw fail(REQUIRED, 'snapshot contains an unsafe array');
      const lengthDesc = Object.getOwnPropertyDescriptor(value, 'length');
      const length = lengthDesc && 'value' in lengthDesc ? lengthDesc.value : -1;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
        throw fail(REQUIRED, 'snapshot contains a sparse or extended array');
      }
      const out = [];
      for (let i = 0; i < length; i += 1) {
        out.push(copyJson(readData(value, String(i)), stack, depth + 1));
      }
      return out;
    }
    if (proto !== Object.prototype && proto !== null) {
      throw fail(REQUIRED, 'snapshot contains a non-plain object');
    }
    const out = {};
    for (const key of keys) {
      if (typeof key !== 'string') throw fail(REQUIRED, 'snapshot contains a symbol key');
      if (FORBIDDEN_KEYS.has(key)) throw fail(REQUIRED, 'snapshot contains a forbidden key');
      out[key] = copyJson(readData(value, key), stack, depth + 1);
    }
    return out;
  } finally {
    stack.delete(value);
  }
}

function readData(target, key) {
  const desc = Object.getOwnPropertyDescriptor(target, key);
  if (!desc || !('value' in desc) || !desc.enumerable) {
    throw fail(REQUIRED, 'snapshot contains an accessor or hidden property');
  }
  return desc.value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// Deterministic JSON: object keys sorted recursively, arrays in original order.
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdentifier(value) {
  return (typeof value === 'string' && value.length > 0) || (Number.isSafeInteger(value) && value > 0);
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw fail(REQUIRED, 'snapshot must be an object');
  if (typeof snapshot.contract !== 'string' || snapshot.contract.length === 0) {
    throw fail(REQUIRED, 'snapshot contract is missing');
  }
  if (typeof snapshot.owner_email !== 'string' || snapshot.owner_email.length === 0) {
    throw fail(REQUIRED, 'snapshot owner is missing');
  }
  if (!isIdentifier(snapshot.organization_id)) throw fail(REQUIRED, 'snapshot organization is missing');
  if (!isIdentifier(snapshot.message_id)) throw fail(REQUIRED, 'snapshot message is missing');
  if (typeof snapshot.message_updated_at !== 'string' || snapshot.message_updated_at.length === 0) {
    throw fail(REQUIRED, 'snapshot message version is missing');
  }
  if (!isPlainObject(snapshot.payload)) throw fail(REQUIRED, 'snapshot payload is missing');
}

function safeSnapshot(snapshot) {
  const copy = copyJson(snapshot, new Set(), 0);
  validateSnapshot(copy);
  return copy;
}

function secretBytes(secret) {
  if (typeof secret === 'string' && secret.length > 0) return new TextEncoder().encode(secret);
  if (secret instanceof Uint8Array && secret.byteLength > 0) return secret;
  throw fail(REQUIRED, 'server approval secret is missing');
}

function requireNow(nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw fail(REQUIRED, 'current time is invalid');
  return nowMs;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fingerprintOf(snapshotCopy) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(snapshotCopy)));
  return toHex(digest);
}

function signedMessage(contract, fingerprint, issuedAt, expiresAt) {
  return new TextEncoder().encode(JSON.stringify([HMAC_DOMAIN, contract, fingerprint, issuedAt, expiresAt]));
}

function importKey(bytes, usage) {
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export function freezeWhatsappSnapshot(snapshot) {
  return deepFreeze(copyJson(snapshot, new Set(), 0));
}

export async function createWhatsappApproval(snapshot, secret, nowMs = Date.now()) {
  const issuedAt = requireNow(nowMs);
  const key = await importKey(secretBytes(secret), 'sign');
  const fingerprint = await fingerprintOf(safeSnapshot(snapshot));
  const expiresAt = issuedAt + WHATSAPP_APPROVAL_TTL_MS;
  const mac = await crypto.subtle.sign(
    'HMAC', key, signedMessage(WHATSAPP_APPROVAL_CONTRACT, fingerprint, issuedAt, expiresAt),
  );
  return Object.freeze({
    contract: WHATSAPP_APPROVAL_CONTRACT,
    fingerprint,
    issued_at: issuedAt,
    expires_at: expiresAt,
    signature: toHex(mac),
  });
}

export async function requireWhatsappApproval(snapshot, approval, secret, nowMs = Date.now()) {
  const now = requireNow(nowMs);
  if (approval === null || approval === undefined) throw fail(REQUIRED, 'approval is missing');
  let envelope;
  try {
    envelope = copyJson(approval, new Set(), 0);
  } catch {
    throw fail(REQUIRED, 'approval is malformed');
  }
  if (!isPlainObject(envelope)) throw fail(REQUIRED, 'approval is malformed');
  const keys = Object.keys(envelope).sort();
  if (keys.length !== APPROVAL_KEYS.length || keys.some((key, i) => key !== APPROVAL_KEYS[i])) {
    throw fail(REQUIRED, 'approval is malformed');
  }
  const { contract, fingerprint, issued_at: issuedAt, expires_at: expiresAt, signature } = envelope;
  if (contract !== WHATSAPP_APPROVAL_CONTRACT) throw fail(REQUIRED, 'approval contract is unsupported');
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || issuedAt < 0) {
    throw fail(REQUIRED, 'approval timestamps are malformed');
  }
  if (expiresAt - issuedAt !== WHATSAPP_APPROVAL_TTL_MS) throw fail(REQUIRED, 'approval lifetime is invalid');
  if (typeof fingerprint !== 'string' || !HEX64.test(fingerprint)
    || typeof signature !== 'string' || !HEX64.test(signature)) {
    throw fail(REQUIRED, 'approval digest is malformed');
  }
  const key = await importKey(secretBytes(secret), 'verify');
  // crypto.subtle.verify performs a constant-time MAC comparison.
  const authentic = await crypto.subtle.verify(
    'HMAC', key, fromHex(signature), signedMessage(contract, fingerprint, issuedAt, expiresAt),
  );
  if (!authentic) throw fail(REQUIRED, 'approval signature is invalid');
  if (now < issuedAt) throw fail(EXPIRED, 'approval is not yet valid');
  if (now >= expiresAt) throw fail(EXPIRED, 'approval has expired');
  const current = await fingerprintOf(safeSnapshot(snapshot));
  if (!constantTimeEqual(current, fingerprint)) throw fail(CONFLICT, 'message changed after approval');
  return deepFreeze(envelope);
}
