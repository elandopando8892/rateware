import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from '../_shared/kinde.ts';
import { resolveRuntimeWorkspaceUser, runtimeIdentityStatus } from '../_shared/runtime-identity.ts';
import {
  PROVIDER_GMAIL_READONLY_SCOPE,
  cleanProviderGmailText,
  getProviderGmailAccessToken,
  providerGmailAllowedAccount,
} from '../_shared/provider-gmail.ts';

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
]);

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

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
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

async function requireConnection(supabase: any, organizationUuid: string, value: unknown) {
  const legalEntityId = requireUuid(value, 'legal_entity_id');
  const mailbox = providerGmailAllowedAccount();
  const result = await supabase.from('provider_gmail_connections')
    .select('*')
    .eq('organization_id', organizationUuid)
    .eq('legal_entity_id', legalEntityId)
    .eq('mailbox_email', mailbox)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || !['connected', 'watching'].includes(result.data.status)) {
    throw new Error(`Connect ${mailbox} to this legal entity before using Gmail intake.`);
  }
  return result.data as Record<string, unknown>;
}

async function gmailJson(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  let payload: Record<string, any> = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(cleanProviderGmailText(payload?.error?.message) || `Gmail API request failed (${response.status}).`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload;
}

function decodeBase64Url(value: unknown) {
  const text = cleanProviderGmailText(value);
  if (!text) return '';
  try {
    const normalized = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function headerValue(payload: Record<string, any>, name: string) {
  const target = name.toLowerCase();
  const headers = Array.isArray(payload?.headers) ? payload.headers : [];
  return cleanProviderGmailText(headers.find((item: any) => String(item?.name || '').toLowerCase() === target)?.value);
}

function parseAddresses(value: unknown) {
  const source = cleanProviderGmailText(value) || '';
  const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(emails.map((email) => email.toLowerCase()))].slice(0, 50);
}

function senderName(value: unknown) {
  const source = cleanProviderGmailText(value) || '';
  const name = source.replace(/<[^>]+>/g, '').replace(/^"|"$/g, '').trim();
  return name && !name.includes('@') ? name.slice(0, 200) : null;
}

function collectParts(payload: Record<string, any>, output: Record<string, any>[] = []) {
  output.push(payload);
  for (const part of Array.isArray(payload?.parts) ? payload.parts : []) collectParts(part, output);
  return output;
}

function extractPlainBody(payload: Record<string, any>) {
  const parts = collectParts(payload, []);
  const plain = parts.find((part) => part.mimeType === 'text/plain' && part?.body?.data);
  const direct = payload?.body?.data ? payload : null;
  return decodeBase64Url(plain?.body?.data || direct?.body?.data).slice(0, 100000);
}

function extractAttachmentMetadata(messageId: string, payload: Record<string, any>) {
  return collectParts(payload, [])
    .filter((part) => cleanProviderGmailText(part?.filename) && cleanProviderGmailText(part?.body?.attachmentId))
    .slice(0, 100)
    .map((part) => ({
      external_attachment_id: String(part.body.attachmentId),
      original_filename: String(part.filename).trim().slice(0, 500),
      mime_type: cleanProviderGmailText(part.mimeType)?.slice(0, 200) || null,
      file_size_bytes: Number.isFinite(Number(part?.body?.size)) ? Math.max(0, Number(part.body.size)) : null,
      metadata: { gmail_message_id: messageId, gmail_part_id: cleanProviderGmailText(part.partId) },
    }));
}

function parsedGmailMessage(raw: Record<string, any>, mailbox: string) {
  const payload = raw.payload || {};
  const from = headerValue(payload, 'From');
  const senderEmails = parseAddresses(from);
  const toEmails = parseAddresses(headerValue(payload, 'To'));
  const ccEmails = parseAddresses(headerValue(payload, 'Cc'));
  const subject = headerValue(payload, 'Subject');
  const messageAt = new Date(Number(raw.internalDate) || Date.now()).toISOString();
  const senderEmail = senderEmails[0] || null;
  return {
    id: String(raw.id),
    threadId: String(raw.threadId),
    internetMessageId: headerValue(payload, 'Message-ID'),
    senderName: senderName(from),
    senderEmail,
    toEmails,
    ccEmails,
    subject,
    bodyText: extractPlainBody(payload),
    messageAt,
    direction: senderEmail === mailbox ? 'outbound' : 'inbound',
    labelIds: Array.isArray(raw.labelIds) ? raw.labelIds.map(String) : [],
    snippet: cleanProviderGmailText(raw.snippet)?.slice(0, 500) || null,
    attachments: extractAttachmentMetadata(String(raw.id), payload),
  };
}

async function ensureThread(supabase: any, organizationUuid: string, legalEntityId: string, mailbox: string, message: ReturnType<typeof parsedGmailMessage>) {
  const existing = await supabase.from('provider_communication_threads')
    .select('id,provider_relationship_id,communication_status,matching_status,match_method,needs_reply,first_message_at,last_message_at')
    .eq('organization_id', organizationUuid)
    .eq('channel', 'email')
    .eq('mailbox_reference', mailbox)
    .eq('external_thread_id', message.threadId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const update: Record<string, unknown> = {
      subject: message.subject,
      last_message_at: message.messageAt,
      updated_at: new Date().toISOString(),
    };
    if (message.direction === 'inbound') {
      update.last_inbound_at = message.messageAt;
      update.communication_status = 'open';
      update.needs_reply = true;
      update.resolved_at = null;
    } else {
      update.last_outbound_at = message.messageAt;
      update.needs_reply = false;
      if (existing.data.communication_status !== 'resolved') update.communication_status = 'waiting_provider';
    }
    const updated = await supabase.from('provider_communication_threads')
      .update(update)
      .eq('organization_id', organizationUuid)
      .eq('id', existing.data.id);
    if (updated.error) throw updated.error;
    return existing.data as Record<string, unknown>;
  }

  const inserted = await supabase.from('provider_communication_threads').insert({
    organization_id: organizationUuid,
    legal_entity_id: legalEntityId,
    provider_relationship_id: null,
    channel: 'email',
    mailbox_reference: mailbox,
    external_thread_id: message.threadId,
    subject: message.subject,
    communication_status: message.direction === 'inbound' ? 'open' : 'waiting_provider',
    matching_status: 'unmatched',
    match_method: 'none',
    needs_reply: message.direction === 'inbound',
    first_message_at: message.messageAt,
    last_message_at: message.messageAt,
    last_inbound_at: message.direction === 'inbound' ? message.messageAt : null,
    last_outbound_at: message.direction === 'outbound' ? message.messageAt : null,
    metadata: { source: 'provider_gmail_intake' },
  }).select('id,provider_relationship_id,communication_status,matching_status,match_method,needs_reply,first_message_at,last_message_at').single();
  if (inserted.error) throw inserted.error;
  return inserted.data as Record<string, unknown>;
}

async function insertMessageAndAttachments(supabase: any, organizationUuid: string, legalEntityId: string, mailbox: string, thread: Record<string, unknown>, message: ReturnType<typeof parsedGmailMessage>) {
  const existing = await supabase.from('provider_communication_messages')
    .select('id')
    .eq('organization_id', organizationUuid)
    .eq('channel', 'email')
    .eq('mailbox_reference', mailbox)
    .eq('external_message_id', message.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { inserted: false, attachmentCount: 0 };

  const inserted = await supabase.from('provider_communication_messages').insert({
    organization_id: organizationUuid,
    legal_entity_id: legalEntityId,
    thread_id: thread.id,
    channel: 'email',
    mailbox_reference: mailbox,
    external_message_id: message.id,
    internet_message_id: message.internetMessageId,
    direction: message.direction,
    sender_name: message.senderName,
    sender_email: message.senderEmail,
    to_emails: message.toEmails,
    cc_emails: message.ccEmails,
    subject: message.subject,
    body_text: message.bodyText || null,
    sensitivity: 'confidential',
    message_at: message.messageAt,
    processing_status: 'processed',
    metadata: {
      gmail_thread_id: message.threadId,
      gmail_label_ids: message.labelIds,
      gmail_snippet: message.snippet,
      ingestion_source: 'provider_gmail_intake',
    },
  }).select('id').single();
  if (inserted.error) throw inserted.error;

  let attachmentCount = 0;
  for (const attachment of message.attachments) {
    const result = await supabase.from('provider_communication_attachments').upsert({
      organization_id: organizationUuid,
      message_id: inserted.data.id,
      legal_entity_id: legalEntityId,
      provider_relationship_id: thread.provider_relationship_id || null,
      external_attachment_id: attachment.external_attachment_id,
      original_filename: attachment.original_filename,
      mime_type: attachment.mime_type,
      file_size_bytes: attachment.file_size_bytes,
      processing_status: 'received',
      metadata: attachment.metadata,
    }, { onConflict: 'organization_id,message_id,external_attachment_id', ignoreDuplicates: true });
    if (result.error) throw result.error;
    attachmentCount += 1;
  }
  return { inserted: true, attachmentCount };
}

async function listHistoryMessageIds(accessToken: string, startHistoryId: string, limit: number) {
  const ids = new Set<string>();
  let pageToken: string | null = null;
  let endHistoryId = startHistoryId;
  do {
    const params = new URLSearchParams({
      startHistoryId,
      maxResults: '500',
      labelId: 'INBOX',
      historyTypes: 'messageAdded',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const payload = await gmailJson(accessToken, `/history?${params.toString()}`);
    for (const history of Array.isArray(payload.history) ? payload.history : []) {
      for (const added of Array.isArray(history.messagesAdded) ? history.messagesAdded : []) {
        if (added?.message?.id) ids.add(String(added.message.id));
        if (ids.size >= limit) break;
      }
      if (ids.size >= limit) break;
    }
    endHistoryId = cleanProviderGmailText(payload.historyId) || endHistoryId;
    pageToken = ids.size < limit ? cleanProviderGmailText(payload.nextPageToken) : null;
  } while (pageToken);
  return { ids: [...ids].slice(0, limit), endHistoryId };
}

async function listRecentMessageIds(accessToken: string, limit: number) {
  const params = new URLSearchParams({ maxResults: String(limit), labelIds: 'INBOX', q: 'newer_than:7d' });
  const payload = await gmailJson(accessToken, `/messages?${params.toString()}`);
  return (Array.isArray(payload.messages) ? payload.messages : []).map((item: any) => String(item.id)).slice(0, limit);
}

async function currentHistoryId(accessToken: string) {
  const profile = await gmailJson(accessToken, '/profile');
  const historyId = cleanProviderGmailText(profile.historyId);
  if (!historyId) throw new Error('Gmail profile did not return a historyId.');
  return historyId;
}

async function syncInbox(supabase: any, organizationUuid: string, body: Record<string, unknown>) {
  const connection = await requireConnection(supabase, organizationUuid, body.legal_entity_id);
  const legalEntityId = String(connection.legal_entity_id);
  const mailbox = String(connection.mailbox_email).toLowerCase();
  const limit = clampInteger(body.limit, 25, 1, 100);
  const accessToken = await getProviderGmailAccessToken(supabase, connection);
  const startHistoryId = cleanProviderGmailText(connection.history_id);
  let syncMode: 'recent' | 'history' = startHistoryId ? 'history' : 'recent';
  let messageIds: string[] = [];
  let endHistoryId = startHistoryId || '';

  const run = await supabase.from('provider_gmail_sync_runs').insert({
    organization_id: organizationUuid,
    legal_entity_id: legalEntityId,
    connection_id: connection.id,
    sync_mode: syncMode,
    status: 'running',
    start_history_id: startHistoryId,
  }).select('id').single();
  if (run.error) throw run.error;
  const now = new Date().toISOString();
  await supabase.from('provider_gmail_connections').update({ last_sync_started_at: now, last_error: null, updated_at: now })
    .eq('organization_id', organizationUuid).eq('id', connection.id);

  try {
    if (startHistoryId) {
      try {
        const history = await listHistoryMessageIds(accessToken, startHistoryId, limit);
        messageIds = history.ids;
        endHistoryId = history.endHistoryId;
      } catch (error) {
        if ((error as Error & { status?: number }).status !== 404) throw error;
        syncMode = 'recent';
        messageIds = await listRecentMessageIds(accessToken, limit);
        endHistoryId = await currentHistoryId(accessToken);
      }
    } else {
      messageIds = await listRecentMessageIds(accessToken, limit);
      endHistoryId = await currentHistoryId(accessToken);
    }

    let insertedMessageCount = 0;
    let duplicateMessageCount = 0;
    let insertedAttachmentCount = 0;
    let latestMessageAt = cleanProviderGmailText(connection.last_message_at);

    for (const id of messageIds) {
      const raw = await gmailJson(accessToken, `/messages/${encodeURIComponent(id)}?format=FULL`);
      if (!Array.isArray(raw.labelIds) || !raw.labelIds.includes('INBOX')) continue;
      const message = parsedGmailMessage(raw, mailbox);
      const thread = await ensureThread(supabase, organizationUuid, legalEntityId, mailbox, message);
      const outcome = await insertMessageAndAttachments(supabase, organizationUuid, legalEntityId, mailbox, thread, message);
      if (outcome.inserted) {
        insertedMessageCount += 1;
        insertedAttachmentCount += outcome.attachmentCount;
        if (!latestMessageAt || message.messageAt > latestMessageAt) latestMessageAt = message.messageAt;
      } else {
        duplicateMessageCount += 1;
      }
    }

    const completedAt = new Date().toISOString();
    const connectionUpdate = await supabase.from('provider_gmail_connections').update({
      history_id: endHistoryId || startHistoryId,
      last_sync_completed_at: completedAt,
      last_message_at: latestMessageAt,
      last_error: null,
      updated_at: completedAt,
    }).eq('organization_id', organizationUuid).eq('id', connection.id);
    if (connectionUpdate.error) throw connectionUpdate.error;

    const runUpdate = await supabase.from('provider_gmail_sync_runs').update({
      sync_mode: syncMode,
      status: 'completed',
      end_history_id: endHistoryId || startHistoryId,
      discovered_message_count: messageIds.length,
      inserted_message_count: insertedMessageCount,
      duplicate_message_count: duplicateMessageCount,
      inserted_attachment_count: insertedAttachmentCount,
      completed_at: completedAt,
    }).eq('id', run.data.id).eq('organization_id', organizationUuid);
    if (runUpdate.error) throw runUpdate.error;

    return {
      data: {
        mailbox_email: mailbox,
        legal_entity_id: legalEntityId,
        sync_mode: syncMode,
        discovered: messageIds.length,
        inserted_messages: insertedMessageCount,
        duplicates: duplicateMessageCount,
        attachment_metadata_rows: insertedAttachmentCount,
        history_id: endHistoryId || startHistoryId,
        outbound_enabled: false,
      },
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = errorMessage(error);
    await supabase.from('provider_gmail_sync_runs').update({
      sync_mode: syncMode,
      status: 'failed',
      error_message: message.slice(0, 2000),
      completed_at: completedAt,
    }).eq('id', run.data.id).eq('organization_id', organizationUuid);
    await supabase.from('provider_gmail_connections').update({
      last_error: message.slice(0, 2000),
      updated_at: completedAt,
    }).eq('organization_id', organizationUuid).eq('id', connection.id);
    throw error;
  }
}

async function renewWatch(supabase: any, organizationUuid: string, body: Record<string, unknown>) {
  if (!PROVIDER_GMAIL_PUBSUB_TOPIC) throw new Error('PROVIDER_GMAIL_PUBSUB_TOPIC is not configured.');
  const connection = await requireConnection(supabase, organizationUuid, body.legal_entity_id);
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
    const action = cleanProviderGmailText(body.action);
    if (!action || !ACTIONS.has(action)) return jsonResponse({ error: 'Unknown Provider Gmail action.' }, 400);
    const { organizationUuid } = await resolveScope(supabase, user as Record<string, unknown>);
    if (action === 'provider_gmail_status') return jsonResponse(await listSafeStatus(supabase, organizationUuid));
    if (action === 'start_provider_gmail_oauth') return jsonResponse(await startOauth(supabase, user as Record<string, unknown>, organizationUuid, body));
    if (action === 'sync_provider_gmail_inbox') return jsonResponse(await syncInbox(supabase, organizationUuid, body));
    return jsonResponse(await renewWatch(supabase, organizationUuid, body));
  } catch (error) {
    const identityStatus = runtimeIdentityStatus(error);
    return jsonResponse({ error: errorMessage(error) }, identityStatus === 403 ? 403 : errorStatus(error));
  }
});
