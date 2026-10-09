import { gmailFailureEvidence } from './gmail-delivery-evidence.mjs';
const profileScopes = new Set(['https://mail.google.com/', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.metadata']);
const sendScopes = new Set(['https://mail.google.com/', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send']);
// Token renewal reuses the existing connector and may update its credential row.
// Role gate for this action is operate, never read. No sending or retries here.
export async function checkGmailConnection({ client, user, sender, resolveToken, fetchImpl = fetch, now = Date.now, timeoutMs = 8000 }) {
  const result = (state, stage, extra = {}) => ({ state, stage, checked_at: new Date(now()).toISOString(), http_status: null, reason_codes: [], send_scope_granted: null, ...extra });
  if (typeof user?.owner_email !== 'string' || !user.owner_email.trim()) return result('not_connected', 'stored');
  let connection;
  try {
    const read = await client.from('gmail_mailbox_connections').select('owner_email,mailbox_email,status,scopes')
      .eq('owner_email', user.owner_email).eq('mailbox_email', sender).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (read.error) return result('unavailable', 'stored');
    connection = read.data;
  } catch { return result('unavailable', 'stored'); }
  if (!connection || connection.owner_email !== user.owner_email || connection.mailbox_email !== sender || connection.status !== 'connected') return result('not_connected', 'stored');
  const scopes = Array.isArray(connection.scopes) ? connection.scopes : [];
  const send_scope_granted = scopes.some(scope => sendScopes.has(scope));
  if (!scopes.some(scope => profileScopes.has(scope))) return result('scope_missing', 'stored', { send_scope_granted });
  let token, timer;
  try {
    token = await Promise.race([resolveToken(client, user, sender), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Credential timeout')), timeoutMs); })]);
    if (typeof token !== 'string' || !token.trim()) return result('credentials_unavailable', 'credentials', { send_scope_granted });
  } catch { return result('credentials_unavailable', 'credentials', { send_scope_granted }); }
  finally { clearTimeout(timer); }
  try {
    const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    });
    let data; try { data = await response.json(); } catch { data = null; }
    const evidence = gmailFailureEvidence(response.status, data);
    const extra = { http_status: evidence.http_status, reason_codes: evidence.provider_reason_codes, send_scope_granted };
    if (!response.ok || response.status !== 200) return result('provider_rejected', 'profile', extra);
    if (typeof data?.emailAddress !== 'string' || data.emailAddress.trim().toLowerCase() !== sender.toLowerCase()) return result('identity_unconfirmed', 'profile', extra);
    return result('available', 'profile', extra);
  } catch { return result('unavailable', 'profile', { send_scope_granted }); }
}
