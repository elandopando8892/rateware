import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders } from '../_shared/kinde.ts';
import {
  cleanProviderGmailText,
  encryptProviderGmailToken,
  fetchProviderGoogleUserEmail,
  providerGmailAllowedAccount,
  validateProviderGmailOutboundScopes,
} from '../_shared/provider-gmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('RATEWARE_SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const RATEWARE_APP_ORIGIN = (Deno.env.get('RATEWARE_APP_ORIGIN') || 'https://rateware.vercel.app').replace(/\/$/, '');

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function redirectUri() {
  return Deno.env.get('PROVIDER_GMAIL_OAUTH_REDIRECT_URI')
    || `${String(SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/provider-gmail-oauth-callback`;
}

function redirectTo(params: Record<string, string>) {
  const target = new URL('provider-gmail.html', `${RATEWARE_APP_ORIGIN}/`);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders(), Location: target.toString() },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'GET') return new Response('GET is required.', { status: 405, headers: corsHeaders(request) });

  const supabase = getClient();
  let stateRow: Record<string, unknown> | null = null;
  try {
    const url = new URL(request.url);
    const code = cleanProviderGmailText(url.searchParams.get('code'));
    const state = cleanProviderGmailText(url.searchParams.get('state'));
    const oauthError = cleanProviderGmailText(url.searchParams.get('error'));
    if (!state) return redirectTo({ gmail: 'error', reason: 'missing_state' });

    const stateResult = await supabase
      .from('provider_gmail_oauth_states')
      .select('*')
      .eq('state', state)
      .maybeSingle();
    if (stateResult.error) throw stateResult.error;
    stateRow = stateResult.data || null;
    if (!stateRow) return redirectTo({ gmail: 'error', reason: 'invalid_state' });
    if (oauthError) return redirectTo({ gmail: 'error', reason: oauthError.slice(0, 100) });
    if (!code) return redirectTo({ gmail: 'error', reason: 'missing_code' });
    if (stateRow.used_at) return redirectTo({ gmail: 'error', reason: 'state_already_used' });
    if (new Date(String(stateRow.expires_at)).getTime() < Date.now()) {
      return redirectTo({ gmail: 'error', reason: 'state_expired' });
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth client is not configured.');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    if (!tokenResponse.ok) {
      throw new Error(cleanProviderGmailText(tokenData.error_description) || cleanProviderGmailText(tokenData.error) || 'Google token exchange failed.');
    }

    const accessToken = cleanProviderGmailText(tokenData.access_token);
    if (!accessToken) throw new Error('Google did not return an access token.');
    const scopes = validateProviderGmailOutboundScopes(tokenData.scope);
    const googleUser = await fetchProviderGoogleUserEmail(accessToken, cleanProviderGmailText(tokenData.id_token));
    const expectedMailbox = cleanProviderGmailText(stateRow.mailbox_email)?.toLowerCase();
    const allowedMailbox = providerGmailAllowedAccount();
    if (!expectedMailbox || googleUser.email !== expectedMailbox || googleUser.email !== allowedMailbox) {
      throw new Error(`Connected Google account must be ${allowedMailbox}.`);
    }

    const existing = await supabase
      .from('provider_gmail_connections')
      .select('id,refresh_token_encrypted')
      .eq('organization_id', stateRow.organization_id)
      .eq('legal_entity_id', stateRow.legal_entity_id)
      .eq('mailbox_email', expectedMailbox)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const refreshTokenEncrypted = tokenData.refresh_token
      ? await encryptProviderGmailToken(String(tokenData.refresh_token))
      : existing.data?.refresh_token_encrypted || null;
    if (!refreshTokenEncrypted) {
      throw new Error('Google did not return a refresh token. Retry consent after revoking the prior grant.');
    }

    const expiresIn = Number(tokenData.expires_in) || 3600;
    const connection = await supabase
      .from('provider_gmail_connections')
      .upsert({
        organization_id: stateRow.organization_id,
        legal_entity_id: stateRow.legal_entity_id,
        mailbox_email: expectedMailbox,
        purpose: 'provider_onboarding',
        status: 'connected',
        scopes,
        access_token_encrypted: await encryptProviderGmailToken(accessToken),
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        google_sub: googleUser.sub,
        history_id: null,
        watch_expiration_at: null,
        last_error: null,
        metadata: { token_type: cleanProviderGmailText(tokenData.token_type) || 'Bearer' },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,legal_entity_id,mailbox_email' });
    if (connection.error) throw connection.error;

    const used = await supabase
      .from('provider_gmail_oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('state', state)
      .is('used_at', null);
    if (used.error) throw used.error;

    return redirectTo({ gmail: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (stateRow?.organization_id && stateRow?.legal_entity_id && stateRow?.mailbox_email) {
      await supabase.from('provider_gmail_connections').upsert({
        organization_id: stateRow.organization_id,
        legal_entity_id: stateRow.legal_entity_id,
        mailbox_email: String(stateRow.mailbox_email).trim().toLowerCase(),
        purpose: 'provider_onboarding',
        status: 'error',
        scopes: [],
        last_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,legal_entity_id,mailbox_email' });
    }
    return redirectTo({ gmail: 'error', reason: message.slice(0, 100) });
  }
});
