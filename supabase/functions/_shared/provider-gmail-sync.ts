import {
  cleanProviderGmailText,
  getProviderGmailAccessToken,
  providerGmailAllowedAccount,
} from './provider-gmail.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function providerGmailSyncErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message || 'Provider Gmail sync failed.';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return cleanProviderGmailText(row.message || row.error || row.details || row.hint) || 'Provider Gmail sync failed.';
  }
  return 'Provider Gmail sync failed.';
}

export function clampProviderGmailInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

export async function requireProviderGmailConnection(
  supabase: any,
  organizationUuid: string,
  legalEntityValue: unknown,
) {
  const legalEntityId = cleanProviderGmailText(legalEntityValue);
  if (!legalEntityId || !UUID_PATTERN.test(legalEntityId)) throw new Error('legal_entity_id must be a valid UUID.');
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

export async function gmailJson(accessToken: string, path: string, init: RequestInit = {}) {
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

function senderDomain(value: string | null) {
  const match = value?.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return match?.[1]?.slice(0, 253) || 'unknown.invalid';
}

async function ensureThread(
  supabase: any,
  organizationUuid: string,
  legalEntityId: string,
  mailbox: string,
  message: ReturnType<typeof parsedGmailMessage>,
) {
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

async function insertMessageAndAttachments(
  supabase: any,
  organizationUuid: string,
  legalEntityId: string,
  mailbox: string,
  thread: Record<string, unknown>,
  message: ReturnType<typeof parsedGmailMessage>,
) {
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

export async function importProviderGmailMessageById(
  supabase: any,
  organizationUuid: string,
  connection: Record<string, unknown>,
  messageIdValue: unknown,
  accessTokenValue?: string,
) {
  const legalEntityId = cleanProviderGmailText(connection.legal_entity_id);
  const mailbox = cleanProviderGmailText(connection.mailbox_email)?.toLowerCase();
  const messageId = cleanProviderGmailText(messageIdValue);
  if (!legalEntityId || !UUID_PATTERN.test(legalEntityId)) {
    throw new Error('Provider Gmail connection has an invalid legal entity.');
  }
  if (!mailbox || mailbox !== providerGmailAllowedAccount()) {
    throw new Error('Provider Gmail connection mailbox is not allowed.');
  }
  if (!messageId || !/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
    throw new Error('Provider Gmail message id is invalid.');
  }
  const accessToken = accessTokenValue || await getProviderGmailAccessToken(supabase, connection);
  const raw = await gmailJson(accessToken, `/messages/${encodeURIComponent(messageId)}?format=FULL`);
  if (!Array.isArray(raw.labelIds) || !raw.labelIds.includes('INBOX')) {
    throw new Error('Provider Gmail message is not in the inbox.');
  }
  const message = parsedGmailMessage(raw, mailbox);
  if (message.id !== messageId || message.direction !== 'inbound') {
    throw new Error('Provider Gmail message is not an inbound intake candidate.');
  }
  const existing = await supabase.from('provider_communication_messages')
    .select('id')
    .eq('organization_id', organizationUuid)
    .eq('channel', 'email')
    .eq('mailbox_reference', mailbox)
    .eq('external_message_id', message.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  let inserted = false;
  let attachmentCount = 0;
  if (!existing.data) {
    const thread = await ensureThread(supabase, organizationUuid, legalEntityId, mailbox, message);
    const outcome = await insertMessageAndAttachments(
      supabase,
      organizationUuid,
      legalEntityId,
      mailbox,
      thread,
      message,
    );
    inserted = outcome.inserted;
    attachmentCount = outcome.attachmentCount;
  }
  return Object.freeze({
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    subject: message.subject,
    senderDomain: senderDomain(message.senderEmail),
    receivedAt: message.messageAt,
    inserted,
    attachmentCount,
  });
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

export async function syncProviderGmailConnection(
  supabase: any,
  organizationUuid: string,
  connection: Record<string, unknown>,
  options: { limit?: number; trigger?: string } = {},
) {
  const legalEntityId = String(connection.legal_entity_id || '');
  const mailbox = String(connection.mailbox_email || '').toLowerCase();
  if (!UUID_PATTERN.test(legalEntityId)) throw new Error('Provider Gmail connection has an invalid legal entity.');
  if (!mailbox || mailbox !== providerGmailAllowedAccount()) throw new Error('Provider Gmail connection mailbox is not allowed.');
  const limit = clampProviderGmailInteger(options.limit, 25, 1, 100);
  const trigger = cleanProviderGmailText(options.trigger) || 'manual';
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
    metadata: { trigger },
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
      metadata: { trigger },
    }).eq('id', run.data.id).eq('organization_id', organizationUuid);
    if (runUpdate.error) throw runUpdate.error;

    return {
      data: {
        run_id: run.data.id,
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
    const message = providerGmailSyncErrorMessage(error);
    await supabase.from('provider_gmail_sync_runs').update({
      sync_mode: syncMode,
      status: 'failed',
      error_message: message.slice(0, 2000),
      completed_at: completedAt,
      metadata: { trigger },
    }).eq('id', run.data.id).eq('organization_id', organizationUuid);
    await supabase.from('provider_gmail_connections').update({
      last_error: message.slice(0, 2000),
      updated_at: completedAt,
    }).eq('organization_id', organizationUuid).eq('id', connection.id);
    throw error;
  }
}
