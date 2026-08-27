import {
  cleanProviderGmailText,
  getProviderGmailAccessToken,
} from "./provider-gmail.ts";
import { gmailJson } from "./provider-gmail-sync.ts";

export type ProviderGmailWatchReceipt = Readonly<{
  mailboxEmail: string;
  legalEntityId: string;
  historyId: string;
  watchExpirationAt: string;
}>;

type ProviderGmailWatchDependencies = Readonly<{
  getAccessToken?: typeof getProviderGmailAccessToken;
  requestGmailJson?: typeof gmailJson;
  now?: () => number;
}>;

export async function renewProviderGmailWatch(
  supabase: any,
  organizationUuid: string,
  connection: Record<string, unknown>,
  topicNameValue: unknown,
  dependencies: ProviderGmailWatchDependencies = {},
): Promise<ProviderGmailWatchReceipt> {
  const topicName = cleanProviderGmailText(topicNameValue);
  if (!topicName) {
    throw new Error("PROVIDER_GMAIL_PUBSUB_TOPIC is not configured.");
  }
  const getAccessToken = dependencies.getAccessToken ??
    getProviderGmailAccessToken;
  const requestGmailJson = dependencies.requestGmailJson ?? gmailJson;
  const now = dependencies.now ?? Date.now;
  const accessToken = await getAccessToken(supabase, connection);
  const watch = await requestGmailJson(accessToken, "/watch", {
    method: "POST",
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    }),
  });
  const historyId = cleanProviderGmailText(watch.historyId);
  const expirationMillis = Number(watch.expiration);
  if (
    !historyId || !Number.isFinite(expirationMillis) ||
    expirationMillis <= now()
  ) {
    throw new Error("Gmail watch response was incomplete.");
  }
  const watchExpirationAt = new Date(expirationMillis).toISOString();
  const updated = await supabase.from("provider_gmail_connections").update({
    status: "watching",
    history_id: historyId,
    watch_expiration_at: watchExpirationAt,
    last_error: null,
    updated_at: new Date(now()).toISOString(),
  }).eq("organization_id", organizationUuid).eq("id", connection.id);
  if (updated.error) throw updated.error;

  return {
    mailboxEmail: String(connection.mailbox_email || "").toLowerCase(),
    legalEntityId: String(connection.legal_entity_id || ""),
    historyId,
    watchExpirationAt,
  };
}
