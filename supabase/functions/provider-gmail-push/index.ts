import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { cleanProviderGmailText, providerGmailAllowedAccount } from '../_shared/provider-gmail.ts';
import { providerGmailSyncErrorMessage, syncProviderGmailConnection } from '../_shared/provider-gmail-sync.ts';
import { verifyProviderPubSubRequest } from '../_shared/provider-pubsub-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('RATEWARE_SUPABASE_SERVICE_ROLE_KEY');

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Provider Gmail Supabase configuration.');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function base64Data(value: unknown) {
  const text = cleanProviderGmailText(value);
  if (!text) throw new Error('Pub/Sub message data is missing.');
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0)));
  } catch {
    throw new Error('Pub/Sub message data is not valid base64.');
  }
}

function parseNotification(payload: Record<string, any>) {
  const message = payload?.message;
  if (!message || typeof message !== 'object') throw new Error('Pub/Sub envelope is missing message.');
  const pubsubMessageId = cleanProviderGmailText(message.messageId || message.message_id);
  if (!pubsubMessageId) throw new Error('Pub/Sub message ID is missing.');
  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(base64Data(message.data)) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Gmail push notification data is not valid JSON.');
    throw error;
  }
  const emailAddress = cleanProviderGmailText(decoded.emailAddress)?.toLowerCase();
  const historyId = cleanProviderGmailText(decoded.historyId);
  if (!emailAddress || !historyId || !/^\d+$/.test(historyId)) {
    throw new Error('Gmail push notification must include emailAddress and numeric historyId.');
  }
  return {
    pubsubMessageId,
    subscriptionName: cleanProviderGmailText(payload.subscription),
    emailAddress,
    historyId,
    publishedAt: cleanProviderGmailText(message.publishTime),
  };
}

function historyAtOrBefore(candidate: string, current: unknown) {
  const currentText = cleanProviderGmailText(current);
  if (!currentText || !/^\d+$/.test(currentText)) return false;
  try {
    return BigInt(candidate) <= BigInt(currentText);
  } catch {
    return false;
  }
}

function response(status: number, body?: Record<string, unknown>) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body || {}), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, { error: 'POST is required.' });

  let auth: Awaited<ReturnType<typeof verifyProviderPubSubRequest>>;
  try {
    auth = await verifyProviderPubSubRequest(request);
  } catch (error) {
    const message = providerGmailSyncErrorMessage(error);
    const status = /configuration is incomplete/i.test(message) ? 500 : 401;
    return response(status, { error: message });
  }

  let notification: ReturnType<typeof parseNotification>;
  try {
    const envelope = await request.json() as Record<string, any>;
    notification = parseNotification(envelope);
  } catch (error) {
    return response(400, { error: providerGmailSyncErrorMessage(error) });
  }

  const allowedMailbox = providerGmailAllowedAccount();
  if (notification.emailAddress !== allowedMailbox) {
    return response(400, { error: 'Gmail notification mailbox is not allowed.' });
  }

  const supabase = getClient();
  let eventId: string | null = null;
  try {
    const connections = await supabase.from('provider_gmail_connections')
      .select('*')
      .eq('mailbox_email', allowedMailbox)
      .in('status', ['connected', 'watching'])
      .limit(2);
    if (connections.error) throw connections.error;
    const rows = connections.data || [];
    if (!rows.length) return response(204);
    if (rows.length !== 1) {
      return response(503, { error: 'Provider Gmail push routing is ambiguous for this mailbox.' });
    }
    const connection = rows[0] as Record<string, unknown>;
    const organizationUuid = String(connection.organization_id);
    const legalEntityId = String(connection.legal_entity_id);

    const inserted = await supabase.from('provider_gmail_push_events').upsert({
      organization_id: organizationUuid,
      legal_entity_id: legalEntityId,
      connection_id: connection.id,
      pubsub_message_id: notification.pubsubMessageId,
      subscription_name: notification.subscriptionName,
      notification_email: notification.emailAddress,
      notification_history_id: notification.historyId,
      published_at: notification.publishedAt,
      status: 'received',
      metadata: {
        oidc_service_account: auth.serviceAccountEmail,
        oidc_audience: auth.audience,
      },
    }, {
      onConflict: 'connection_id,pubsub_message_id',
      ignoreDuplicates: true,
    });
    if (inserted.error) throw inserted.error;

    const eventResult = await supabase.from('provider_gmail_push_events')
      .select('id,status,sync_run_id')
      .eq('connection_id', connection.id)
      .eq('pubsub_message_id', notification.pubsubMessageId)
      .maybeSingle();
    if (eventResult.error) throw eventResult.error;
    if (!eventResult.data) throw new Error('Provider Gmail push event could not be persisted.');
    eventId = eventResult.data.id;
    if (['completed', 'ignored_stale'].includes(eventResult.data.status)) return response(204);

    if (historyAtOrBefore(notification.historyId, connection.history_id)) {
      const ignoredAt = new Date().toISOString();
      const ignored = await supabase.from('provider_gmail_push_events').update({
        status: 'ignored_stale',
        processed_at: ignoredAt,
        error_message: null,
      }).eq('id', eventId).eq('connection_id', connection.id);
      if (ignored.error) throw ignored.error;
      return response(204);
    }

    const claimed = await supabase.from('provider_gmail_push_events').update({
      status: 'processing',
      processed_at: null,
      error_message: null,
    })
      .eq('id', eventId)
      .eq('connection_id', connection.id)
      .in('status', ['received', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) return response(503, { error: 'Provider Gmail push event is already processing.' });

    const synced = await syncProviderGmailConnection(supabase, organizationUuid, connection, {
      limit: 25,
      trigger: 'pubsub',
    });
    const completedAt = new Date().toISOString();
    const completed = await supabase.from('provider_gmail_push_events').update({
      status: 'completed',
      sync_run_id: synced.data.run_id,
      processed_at: completedAt,
      error_message: null,
    }).eq('id', eventId).eq('connection_id', connection.id);
    if (completed.error) throw completed.error;
    return response(204);
  } catch (error) {
    const message = providerGmailSyncErrorMessage(error);
    if (eventId) {
      await supabase.from('provider_gmail_push_events').update({
        status: 'failed',
        processed_at: new Date().toISOString(),
        error_message: message.slice(0, 2000),
      }).eq('id', eventId);
    }
    return response(500, { error: message });
  }
});
