function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function requiredEncryptionSecret(value: string) {
  const secret = String(value || "").trim();
  if (!secret) throw new Error("Bid Room invitation token encryption is not configured.");
  return secret;
}

async function invitationCryptoKey(secret: string, usages: KeyUsage[]) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(requiredEncryptionSecret(secret)),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

export async function hashRfxInvitationToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export async function encryptRfxInvitationToken(value: string, secret: string) {
  const key = await invitationCryptoKey(secret, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptRfxInvitationToken(value: unknown, secret: string) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return null;
  const [version, ivText, ciphertextText] = text.split(":");
  if (version !== "v1" || !ivText || !ciphertextText) {
    throw new Error("Bid Room invitation token format is invalid.");
  }
  const key = await invitationCryptoKey(secret, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivText) },
    key,
    base64ToBytes(ciphertextText),
  );
  return new TextDecoder().decode(plain);
}
