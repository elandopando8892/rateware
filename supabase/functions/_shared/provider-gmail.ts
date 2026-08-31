export const PROVIDER_GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const PROVIDER_GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const PROVIDER_GMAIL_OUTBOUND_ALLOWED_SCOPES = Object.freeze([
  'openid',
  'email',
  'https://www.googleapis.com/auth/userinfo.email',
  PROVIDER_GMAIL_READONLY_SCOPE,
  PROVIDER_GMAIL_SEND_SCOPE,
]);
export const PROVIDER_GMAIL_FORBIDDEN_SCOPES = Object.freeze([
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
]);

const GMAIL_TOKEN_ENCRYPTION_KEY = Deno.env.get('GMAIL_TOKEN_ENCRYPTION_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

export function providerGmailAllowedAccount() {
  return (Deno.env.get('PROVIDER_GMAIL_ALLOWED_ACCOUNT') || 'carriers@xbfreight.com').trim().toLowerCase();
}

export function cleanProviderGmailText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlToJsonPayload(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {} as Record<string, unknown>;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

async function importEncryptionKey(usages: KeyUsage[]) {
  if (!GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(GMAIL_TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, usages);
}

export async function encryptProviderGmailToken(value: string) {
  const key = await importEncryptionKey(['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptProviderGmailToken(value: string) {
  const [version, encodedIv, encodedCiphertext] = String(value || '').split(':');
  if (version !== 'v1' || !encodedIv || !encodedCiphertext) throw new Error('Unsupported Gmail token envelope.');
  const key = await importEncryptionKey(['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encodedIv) },
    key,
    base64ToBytes(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function parseProviderGmailScopes(value: unknown) {
  const scopes = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : String(value || '').split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return [...new Set(scopes)];
}

export function validateProviderGmailScopes(value: unknown) {
  const scopes = parseProviderGmailScopes(value);
  if (!scopes.includes(PROVIDER_GMAIL_READONLY_SCOPE)) {
    throw new Error('Provider Gmail connection must include gmail.readonly.');
  }
  const forbidden = PROVIDER_GMAIL_FORBIDDEN_SCOPES.filter((scope) => scopes.includes(scope));
  if (forbidden.length) throw new Error(`Provider Gmail connection contains forbidden scope: ${forbidden[0]}.`);
  return scopes;
}

export function validateProviderGmailOutboundScopes(value: unknown) {
  const scopes = validateProviderGmailScopes(value);
  if (!scopes.includes(PROVIDER_GMAIL_SEND_SCOPE)) {
    throw new Error('Provider Gmail connection must include gmail.send.');
  }
  const unexpected = scopes.filter((scope) => !PROVIDER_GMAIL_OUTBOUND_ALLOWED_SCOPES.includes(scope));
  if (unexpected.length) {
    throw new Error(`Provider Gmail connection contains an unexpected scope: ${unexpected[0]}.`);
  }
  return scopes;
}

export async function fetchProviderGoogleUserEmail(accessToken: string, idToken?: string | null) {
  const payload = idToken ? base64UrlToJsonPayload(idToken) : {};
  const tokenEmail = cleanProviderGmailText(payload.email)?.toLowerCase();
  if (tokenEmail) return { email: tokenEmail, sub: cleanProviderGmailText(payload.sub) };

  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Google userinfo lookup failed.');
  const profile = await response.json() as Record<string, unknown>;
  return {
    email: cleanProviderGmailText(profile.email)?.toLowerCase(),
    sub: cleanProviderGmailText(profile.sub),
  };
}

export async function getProviderGmailAccessToken(supabase: any, connection: Record<string, unknown>) {
  const encryptedAccessToken = cleanProviderGmailText(connection.access_token_encrypted);
  const expiresAt = connection.token_expires_at ? new Date(String(connection.token_expires_at)).getTime() : 0;
  if (encryptedAccessToken && expiresAt > Date.now() + 60_000) {
    return await decryptProviderGmailToken(encryptedAccessToken);
  }

  const encryptedRefreshToken = cleanProviderGmailText(connection.refresh_token_encrypted);
  if (!encryptedRefreshToken) throw new Error('Provider Gmail refresh token is unavailable. Reconnect the mailbox.');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth client is not configured.');

  const refreshToken = await decryptProviderGmailToken(encryptedRefreshToken);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(cleanProviderGmailText(payload.error_description) || cleanProviderGmailText(payload.error) || 'Google token refresh failed.');
  }

  const accessToken = cleanProviderGmailText(payload.access_token);
  if (!accessToken) throw new Error('Google token refresh did not return an access token.');
  const scopes = payload.scope ? validateProviderGmailScopes(payload.scope) : validateProviderGmailScopes(connection.scopes || []);
  const expiresIn = Number(payload.expires_in) || 3600;
  const update = await supabase
    .from('provider_gmail_connections')
    .update({
      access_token_encrypted: await encryptProviderGmailToken(accessToken),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scopes,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
    .eq('organization_id', connection.organization_id);
  if (update.error) throw update.error;
  return accessToken;
}
