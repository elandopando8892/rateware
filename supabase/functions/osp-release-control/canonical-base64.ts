const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function reject(): never {
  throw new TypeError("NON_CANONICAL_BASE64");
}

export function decodeCanonicalBase64(value: string): Uint8Array {
  if (!CANONICAL_BASE64.test(value)) reject();
  try {
    const decoded = atob(value);
    if (btoa(decoded) !== value) reject();
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    reject();
  }
}
