import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import postgres from "npm:postgres@3.4.7";

import {
  importProviderGmailMessageById,
  requireProviderGmailConnection,
  syncProviderGmailConnection,
} from "../_shared/provider-gmail-sync.ts";
import { searchProviderGmailHistoricalInbox } from "../_shared/provider-gmail-historical.ts";
import {
  getProviderGmailAccessToken,
  PROVIDER_GMAIL_READONLY_SCOPE,
  PROVIDER_GMAIL_SEND_SCOPE,
  providerGmailAllowedAccount,
} from "../_shared/provider-gmail.ts";
import { renewProviderGmailWatch } from "../_shared/provider-gmail-watch.ts";
import {
  triggerExactOspGmailIngest,
  triggerOspGmailWorker,
} from "../_shared/osp/worker-trigger.ts";
import { OSP_PRODUCTION_ORGANIZATION_BINDING } from "../osp-read-api/auth-policy.ts";
import { createOspRuntimeJwtVerifier } from "../osp-read-api/auth-runtime.ts";
import { OspApiError } from "../osp-read-api/http.ts";
import { createPostgresOspReadStore } from "../osp-read-api/postgres-store.ts";
import { createOspGmailSyncHandler } from "./handler.ts";
import { createPostgresHistoricalImportStore } from "./historical-import-store.ts";
import { withGmailDependencyStage } from "./dependency-stage.ts";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return value;
}

async function sha256(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomOauthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

let runtime: (request: Request) => Promise<Response>;
try {
  const supabaseUrl = required("SUPABASE_URL");
  const serviceRoleKey = required("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
  const verifier = createOspRuntimeJwtVerifier({
    env: Deno.env,
    fetch: globalThis.fetch.bind(globalThis),
    organizationBinding: OSP_PRODUCTION_ORGANIZATION_BINDING,
  });
  const databaseUrl = Deno.env.get("OSP_READ_DATABASE_URL")?.trim() ||
    required("SUPABASE_DB_URL");
  const store = createPostgresOspReadStore({
    databaseUrl,
    postgresFactory: postgres,
  });
  const historicalImportStore = createPostgresHistoricalImportStore({
    databaseUrl,
    postgresFactory: postgres,
  });
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const pubsubTopic = Deno.env.get("PROVIDER_GMAIL_PUBSUB_TOPIC")?.trim() ||
    null;
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim() || "";
  const oauthRedirectUri = Deno.env.get("PROVIDER_GMAIL_OAUTH_REDIRECT_URI")?.trim() ||
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/provider-gmail-oauth-callback`;
  const pubsubReady = Boolean(
    pubsubTopic &&
      Deno.env.get("PROVIDER_GMAIL_PUBSUB_AUDIENCE")?.trim() &&
      Deno.env.get("PROVIDER_GMAIL_PUBSUB_SERVICE_ACCOUNT")?.trim(),
  );

  const providerConnection = async (organizationId: string) => {
    const selected = await supabase.from("provider_gmail_connections")
      .select("legal_entity_id")
      .eq("organization_id", organizationId)
      .eq("purpose", "provider_onboarding")
      .eq("mailbox_email", "carriers@xbfreight.com")
      .in("status", ["connected", "watching"])
      .limit(2);
    if (selected.error || selected.data?.length !== 1) {
      throw new OspApiError("DEPENDENCY_UNAVAILABLE");
    }
    return await requireProviderGmailConnection(
      supabase,
      organizationId,
      selected.data[0].legal_entity_id,
    );
  };

  runtime = createOspGmailSyncHandler({
    verifyToken: (token, signal) => verifier.verify(token, signal),
    resolveWorkspace: (identity, signal) =>
      store.resolveWorkspace(identity, signal),
    startOauth: async (organizationId, identity) => {
      if (!googleClientId) throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      const mailboxEmail = providerGmailAllowedAccount();
      if (mailboxEmail !== "carriers@xbfreight.com") {
        throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      }
      const selected = await supabase.from("provider_gmail_connections")
        .select("legal_entity_id")
        .eq("organization_id", organizationId)
        .eq("purpose", "provider_onboarding")
        .eq("mailbox_email", mailboxEmail)
        .limit(2);
      if (selected.error || selected.data?.length !== 1) {
        throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      }
      const legalEntityId = selected.data[0].legal_entity_id;
      const entity = await supabase.from("legal_entities")
        .select("id,status")
        .eq("organization_id", organizationId)
        .eq("id", legalEntityId)
        .eq("status", "active")
        .maybeSingle();
      if (entity.error || !entity.data) {
        throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      }
      const state = randomOauthState();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const inserted = await supabase.from("provider_gmail_oauth_states").insert({
        state,
        organization_id: organizationId,
        legal_entity_id: legalEntityId,
        mailbox_email: mailboxEmail,
        requested_by_user_id: identity.subject,
        requested_by_email: identity.email,
        redirect_after: "osp_pipeline",
        expires_at: expiresAt,
        metadata: { purpose: "provider_onboarding", initiated_from: "osp" },
      });
      if (inserted.error) throw new OspApiError("DEPENDENCY_UNAVAILABLE");

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", googleClientId);
      authUrl.searchParams.set("redirect_uri", oauthRedirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("include_granted_scopes", "false");
      authUrl.searchParams.set("login_hint", mailboxEmail);
      authUrl.searchParams.set(
        "scope",
        `openid email ${PROVIDER_GMAIL_READONLY_SCOPE} ${PROVIDER_GMAIL_SEND_SCOPE}`,
      );
      authUrl.searchParams.set("state", state);
      return { authUrl: authUrl.toString(), expiresAt, mailboxEmail };
    },
    syncInbox: async (organizationId) => {
      const connection = await providerConnection(organizationId);
      const synced = await syncProviderGmailConnection(
        supabase,
        organizationId,
        connection,
        {
          limit: 50,
          trigger: "osp_manual_no_pubsub",
        },
      );
      const osp = await triggerOspGmailWorker({
        supabaseUrl,
        serviceRoleKey,
        limit: 10,
      });
      return {
        discovered: Number(synced.data.discovered),
        insertedMessages: Number(synced.data.inserted_messages),
        duplicates: Number(synced.data.duplicates),
        attachmentMetadataRows: Number(synced.data.attachment_metadata_rows),
        ospEnqueued: osp.enqueued,
        ospProcessed: osp.processed,
      };
    },
    renewWatch: async (organizationId) => {
      if (!pubsubReady || !pubsubTopic) {
        throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      }
      const connection = await providerConnection(organizationId);
      const receipt = await renewProviderGmailWatch(
        supabase,
        organizationId,
        connection,
        pubsubTopic,
      );
      return { watchExpiresAt: receipt.watchExpirationAt };
    },
    previewHistoricalInbox: async (organizationId, criteria) => {
      const connection = await withGmailDependencyStage(
        "connection",
        () => providerConnection(organizationId),
      );
      const accessToken = await withGmailDependencyStage(
        "access_token",
        () =>
          getProviderGmailAccessToken(
            supabase,
            connection,
          ),
      );
      const result = await withGmailDependencyStage(
        "historical_search",
        () =>
          searchProviderGmailHistoricalInbox(
            accessToken,
            criteria,
          ),
      );
      const ids = result.candidates.map((candidate) =>
        candidate.gmailMessageId
      );
      const imported = new Set<string>();
      if (ids.length > 0) {
        const existing = await supabase.from("provider_communication_messages")
          .select("external_message_id")
          .eq("organization_id", organizationId)
          .eq("channel", "email")
          .eq("mailbox_reference", "carriers@xbfreight.com")
          .in("external_message_id", ids);
        if (existing.error) throw existing.error;
        for (const row of existing.data || []) {
          if (typeof row.external_message_id === "string") {
            imported.add(row.external_message_id);
          }
        }
      }
      return {
        query: result.query,
        candidates: result.candidates.map((candidate) => ({
          candidateId: candidate.gmailMessageId,
          subject: candidate.subject,
          senderDomain: candidate.senderDomain,
          receivedAt: candidate.receivedAt,
          attachmentCount: candidate.attachmentCount,
          duplicateState: imported.has(candidate.gmailMessageId)
            ? "already_imported" as const
            : "ready" as const,
        })),
      };
    },
    importHistoricalInbox: async (organizationId, identity, input) => {
      const connection = await providerConnection(organizationId);
      const accessToken = await getProviderGmailAccessToken(
        supabase,
        connection,
      );
      const preflight = await searchProviderGmailHistoricalInbox(
        accessToken,
        input.criteria,
      );
      const candidate = preflight.candidates.find((item) =>
        item.gmailMessageId === input.candidateId
      );
      if (!candidate) throw new OspApiError("INVALID_REQUEST");
      const imported = await withGmailDependencyStage(
        "historical_import",
        () =>
          importProviderGmailMessageById(
            supabase,
            organizationId,
            connection,
            input.candidateId,
            accessToken,
            { allowHistoricalArchive: true },
          ),
      );
      if (
        typeof imported.subject !== "string" ||
        imported.gmailThreadId !== candidate.gmailThreadId ||
        imported.subject !== candidate.subject ||
        imported.senderDomain !== candidate.senderDomain ||
        imported.receivedAt !== candidate.receivedAt
      ) throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      const importedSubject = imported.subject;
      const requestSha256 = await sha256(JSON.stringify({
        version: 1,
        action: "import_historical_provider_gmail",
        organizationId,
        actorSubject: identity.subject,
        candidateId: input.candidateId,
        criteria: input.criteria,
      }));
      const claim = await withGmailDependencyStage(
        "historical_claim",
        async () =>
          historicalImportStore.record({
            organizationId,
            mailboxEmail: "carriers@xbfreight.com",
            gmailMessageId: imported.gmailMessageId,
            gmailThreadId: imported.gmailThreadId,
            subjectSha256: await sha256(importedSubject),
            senderDomain: imported.senderDomain,
            receivedAt: imported.receivedAt,
            actorSubject: identity.subject,
            idempotencyKey: input.idempotencyKey,
            requestSha256,
            providerMessageInserted: imported.inserted,
            attachmentMetadataRows: imported.attachmentCount,
          }),
      );
      const processed = claim.jobCompleted
        ? 0
        : (await triggerExactOspGmailIngest({
          supabaseUrl,
          serviceRoleKey,
          organizationId,
          jobId: claim.jobId,
          gmailMessageId: imported.gmailMessageId,
        })).processed;
      return {
        candidateId: imported.gmailMessageId,
        claimId: claim.claimId,
        importStatus: claim.status,
        attachmentMetadataRows: claim.attachmentMetadataRows,
        ospEnqueued: claim.ospEnqueued,
        ospProcessed: processed,
      };
    },
  });
} catch (error) {
  console.error(
    "OSP_GMAIL_SYNC_BOOT_FAILED",
    error instanceof Error ? error.message : "UNKNOWN_BOOT_ERROR",
  );
  runtime = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          error: { code: "INTERNAL_ERROR", incident_id: crypto.randomUUID() },
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      ),
    );
}

Deno.serve(runtime);
