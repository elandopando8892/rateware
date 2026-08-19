import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from '../_shared/kinde.ts';
import { classifyOnboardingRequest, resolveProviderKeys } from '../_shared/provider-agent-classifier.mjs';
import { resolveXbfEntity } from '../_shared/provider-agent-resolution.mjs';
import { resolveRuntimeWorkspaceUser, runtimeIdentityStatus } from '../_shared/runtime-identity.ts';
import {
  PROVIDER_GMAIL_READONLY_SCOPE,
  cleanProviderGmailText,
  getProviderGmailAccessToken,
  providerGmailAllowedAccount,
} from '../_shared/provider-gmail.ts';
import {
  clampProviderGmailInteger,
  gmailJson,
  requireProviderGmailConnection,
  syncProviderGmailConnection,
} from '../_shared/provider-gmail-sync.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('RATEWARE_SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const PROVIDER_GMAIL_PUBSUB_TOPIC = cleanProviderGmailText(Deno.env.get('PROVIDER_GMAIL_PUBSUB_TOPIC'));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set([
  'provider_gmail_status',
  'start_provider_gmail_oauth',
  'sync_provider_gmail_inbox',
  'renew_provider_gmail_watch',
  'preview_provider_message_intake',
]);

/**
 * Dry-run the agent's reading of one message.
 *
 * Read-only in the strongest sense: it writes no row, creates no case, links no
 * provider and stores nothing — not the subject, not the body. It returns the
 * proposal the intake would make, plus the audit fields §17 requires, so an
 * operator can see how a real carrier email classifies before Gmail is connected
 * and can diagnose a misclassification afterwards.
 *
 * It runs inside the edge runtime precisely so the model keys stay in the
 * project's secrets and never leave it.
 */
async function previewIntake(body: Record<string, unknown>) {
  const subject = cleanProviderGmailText(body.subject) ?? '';
  const bodyText = typeof body.body_text === 'string' ? body.body_text.slice(0, 40000) : '';
  if (!subject && !bodyText) throw new Error('A subject or body is required to preview intake.');
  const attachmentNames = Array.isArray(body.attachment_names)
    ? body.attachment_names.map((name) => String(name ?? '').trim().slice(0, 300)).filter(Boolean).slice(0, 100)
    : [];

  const classification = await classifyOnboardingRequest(
    { subject, body_text: bodyText, attachment_names: attachmentNames },
    // Shared with the Gmail intake so both resolve the same secrets in the same
    // order; a key that works in the preview must work in production.
    resolveProviderKeys(Deno.env),
  );
  const entity = resolveXbfEntity({
    subject,
    body_text: bodyText,
    attachment_names: attachmentNames,
    relationship_entity_kind: null,
  });

  return {
    data: {
      // The proposal, never a decision.
      decision: 'proposed',
      request_type: classification.request_type,
      confidence: classification.confidence,
      language: classification.language,
      requested_documents: classification.requested_documents,
      forms_to_complete: classification.forms_to_complete,
      deadline_text: classification.deadline_text ?? null,
      entity: {
        entity_kind: entity.entity_kind,
        decision: entity.decision,
        basis: entity.basis,
        confidence: entity.confidence,
        requires_human_selection: entity.requires_human_selection,
      },
      // §17 audit: engine and versions travel with every agent result. The prompt
      // and the message content do not — only the context digest.
      engine: classification.engine,
      model: classification.model,
      prompt_version: classification.prompt_version,
      policy_version: classification.policy_version,
      context_digest: classification.context_digest,
      attempted_engines: classification.attempts.map((attempt: Record<string, unknown>) => attempt.engine),
      // Why a tier was skipped is the whole point of a preview: a silent fallback
      // to keywords looks identical to no key at all. Bounded and scrubbed of
      // anything key-shaped, since a provider error can echo the request.
      attempts: classification.attempts.map((attempt: Record<string, unknown>) => ({
        engine: attempt.engine,
        error: attempt.error
          ? String(attempt.error).replace(/\b(sk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]').slice(0, 240)
          : null,
      })),
    },
  };
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Provider Gmail Supabase configuration.');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message || 'Provider Gmail request failed.';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return cleanProviderGmailText(row.message || row.error || row.details || row.hint) || 'Provider Gmail request failed.';
  }
  return 'Provider Gmail request failed.';
}

function errorStatus(value: unknown) {
  const explicit = Number((value as { status?: number } | null)?.status);
  if (Number.isFinite(explicit) && explicit >= 400 && explicit < 600) return explicit;
  const message = errorMessage(value).toLowerCase();
  if (/bearer|jwt|token|auth|unauthorized|sign in|kinde/.test(message)) return 401;
  if (/not found/.test(message)) return 404;
  return 500;
}

function requireUuid(value: unknown, field: string) {
  const normalized = cleanProviderGmailText(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a valid UUID.`);
  return normalized;
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function oauthRedirectUri() {
  return Deno.env.get('PROVIDER_GMAIL_OAUTH_REDIRECT_URI')
    || `${String(SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/provider-gmail-oauth-callback`;
}

async function resolveScope(supabase: any, user: Record<string, unknown>) {
  const workspaceId = cleanProviderGmailText(user.organization_id);
  if (!workspaceId) throw new Error('Organization workspace is required for Provider Gmail.');
  const registry = await supabase.from('workspace_registry')
    .select('organization_uuid')
    .eq('organization_id', workspaceId)
    .maybeSingle();
  if (registry.error) throw registry.error;
  const organizationUuid = cleanProviderGmailText(registry.data?.organization_uuid);
  if (!organizationUuid || !UUID_PATTERN.test(organizationUuid)) throw new Error('Workspace tenant mapping is incomplete.');
  return { organizationUuid };
}

async function requireLegalEntity(supabase: any, organizationUuid: string, value: unknown) {
  const legalEntityId = requireUuid(value, 'legal_entity_id');
  const result = await supabase.from('legal_entities')
    .select('id,entity_code,legal_name,country_code,default_currency,status')
    .eq('organization_id', organizationUuid)
    .eq('id', legalEntityId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error('Legal entity not found in this workspace.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  if (result.data.status !== 'active') throw new Error('Provider Gmail can only be connected to an active legal entity.');
  return result.data as Record<string, unknown>;
}

async function listSafeStatus(supabase: any, organizationUuid: string) {
  const [entities, connections] = await Promise.all([
    supabase.from('legal_entities')
      .select('id,entity_code,legal_name,country_code,default_currency,status')
      .eq('organization_id', organizationUuid)
      .order('entity_code', { ascending: true }),
    supabase.from('provider_gmail_connections')
      .select('id,legal_entity_id,mailbox_email,purpose,status,scopes,token_expires_at,history_id,watch_expiration_at,last_sync_started_at,last_sync_completed_at,last_message_at,last_error,updated_at')
      .eq('organization_id', organizationUuid)
      .order('updated_at', { ascending: false }),
  ]);
  if (entities.error) throw entities.error;
  if (connections.error) throw connections.error;
  return {
    data: {
      mailbox_email: providerGmailAllowedAccount(),
      required_scope: PROVIDER_GMAIL_READONLY_SCOPE,
      legal_entities: entities.data || [],
      connections: connections.data || [],
      outbound_enabled: false,
      pubsub_configured: Boolean(PROVIDER_GMAIL_PUBSUB_TOPIC),
    },
  };
}

async function startOauth(supabase: any, user: Record<string, unknown>, organizationUuid: string, body: Record<string, unknown>) {
  if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not configured.');
  const entity = await requireLegalEntity(supabase, organizationUuid, body.legal_entity_id);
  const mailbox = providerGmailAllowedAccount();
  const state = randomState();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const inserted = await supabase.from('provider_gmail_oauth_states').insert({
    state,
    organization_id: organizationUuid,
    legal_entity_id: entity.id,
    mailbox_email: mailbox,
    requested_by_user_id: cleanProviderGmailText(user.id || user.user_id || user.sub),
    requested_by_email: cleanProviderGmailText(user.owner_email || user.email)?.toLowerCase() || null,
    redirect_after: 'provider-gmail.html',
    expires_at: expiresAt,
    metadata: { purpose: 'provider_onboarding' },
  });
  if (inserted.error) throw inserted.error;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', oauthRedirectUri());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'false');
  authUrl.searchParams.set('login_hint', mailbox);
  authUrl.searchParams.set('scope', `openid email ${PROVIDER_GMAIL_READONLY_SCOPE}`);
  authUrl.searchParams.set('state', state);

  return {
    data: {
      auth_url: authUrl.toString(),
      expires_at: expiresAt,
      mailbox_email: mailbox,
      legal_entity: entity,
      outbound_enabled: false,
    },
  };
}

async function syncInbox(supabase: any, organizationUuid: string, body: Record<string, unknown>) {
  const connection = await requireProviderGmailConnection(supabase, organizationUuid, body.legal_entity_id);
  return await syncProviderGmailConnection(supabase, organizationUuid, connection, {
    limit: clampProviderGmailInteger(body.limit, 25, 1, 100),
    trigger: 'manual',
  });
}

async function renewWatch(supabase: any, organizationUuid: string, body: Record<string, unknown>) {
  if (!PROVIDER_GMAIL_PUBSUB_TOPIC) throw new Error('PROVIDER_GMAIL_PUBSUB_TOPIC is not configured.');
  const connection = await requireProviderGmailConnection(supabase, organizationUuid, body.legal_entity_id);
  const accessToken = await getProviderGmailAccessToken(supabase, connection);
  const watch = await gmailJson(accessToken, '/watch', {
    method: 'POST',
    body: JSON.stringify({
      topicName: PROVIDER_GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    }),
  });
  const historyId = cleanProviderGmailText(watch.historyId);
  const expirationMillis = Number(watch.expiration);
  if (!historyId || !Number.isFinite(expirationMillis)) throw new Error('Gmail watch response was incomplete.');
  const watchExpirationAt = new Date(expirationMillis).toISOString();
  const updated = await supabase.from('provider_gmail_connections').update({
    status: 'watching',
    history_id: historyId,
    watch_expiration_at: watchExpirationAt,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('organization_id', organizationUuid).eq('id', connection.id);
  if (updated.error) throw updated.error;
  return {
    data: {
      mailbox_email: connection.mailbox_email,
      legal_entity_id: connection.legal_entity_id,
      history_id: historyId,
      watch_expiration_at: watchExpirationAt,
      outbound_enabled: false,
    },
  };
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ error: 'POST is required.' }, 405);

  try {
    const supabase = getClient();
    const identity = await requireKindeUser(request);
    const user = await resolveRuntimeWorkspaceUser(supabase, identity as Record<string, unknown>, { persistLegacyIdentity: false });
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.action !== 'string' || !ACTIONS.has(body.action)) return jsonResponse({ error: 'Unknown Provider Gmail action.' }, 400);
    const { organizationUuid } = await resolveScope(supabase, user as Record<string, unknown>);
    if (body.action === 'provider_gmail_status') return jsonResponse(await listSafeStatus(supabase, organizationUuid));
    if (body.action === 'start_provider_gmail_oauth') return jsonResponse(await startOauth(supabase, user as Record<string, unknown>, organizationUuid, body));
    if (body.action === 'sync_provider_gmail_inbox') return jsonResponse(await syncInbox(supabase, organizationUuid, body));
    if (body.action === 'renew_provider_gmail_watch') return jsonResponse(await renewWatch(supabase, organizationUuid, body));
    if (body.action === 'preview_provider_message_intake') return jsonResponse(await previewIntake(body));
    return jsonResponse({ error: 'Unknown Provider Gmail action.' }, 400);
  } catch (error) {
    const identityStatus = runtimeIdentityStatus(error);
    return jsonResponse({ error: errorMessage(error) }, identityStatus === 403 ? 403 : errorStatus(error));
  }
});
