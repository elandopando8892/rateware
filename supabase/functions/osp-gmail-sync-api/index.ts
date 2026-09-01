import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import postgres from "npm:postgres@3.4.7";

import {
  importProviderGmailMessageById,
  requireProviderGmailConnection,
  syncProviderGmailConnection,
} from "../_shared/provider-gmail-sync.ts";
import { searchProviderGmailHistoricalInbox } from "../_shared/provider-gmail-historical.ts";
import { getProviderGmailAccessToken } from "../_shared/provider-gmail.ts";
import { renewProviderGmailWatch } from "../_shared/provider-gmail-watch.ts";
import { triggerOspGmailWorker } from "../_shared/osp/worker-trigger.ts";
import { OSP_PRODUCTION_ORGANIZATION_BINDING } from "../osp-read-api/auth-policy.ts";
import { OspApiError } from "../osp-read-api/http.ts";
import { createKindeJwtVerifier } from "../osp-read-api/kinde-jwt.ts";
import { createPostgresOspReadStore } from "../osp-read-api/postgres-store.ts";
import { createOspGmailSyncHandler } from "./handler.ts";
import { createPostgresHistoricalImportStore } from "./historical-import-store.ts";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return value;
}

function issuer(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.search ||
      url.hash ||
      (url.pathname !== "" && url.pathname !== "/")
    ) throw new Error();
    return url.origin;
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  )].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

let runtime: (request: Request) => Promise<Response>;
try {
  const supabaseUrl = required("SUPABASE_URL");
  const serviceRoleKey = required("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
  const verifier = createKindeJwtVerifier({
    issuer: issuer(required("OSP_KINDE_ISSUER")),
    clientId: required("OSP_KINDE_CLIENT_ID"),
    jwksFetch: globalThis.fetch.bind(globalThis),
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
      const connection = await providerConnection(organizationId);
      const accessToken = await getProviderGmailAccessToken(
        supabase,
        connection,
      );
      const result = await searchProviderGmailHistoricalInbox(
        accessToken,
        criteria,
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
      const imported = await importProviderGmailMessageById(
        supabase,
        organizationId,
        connection,
        input.candidateId,
        accessToken,
      );
      if (
        imported.gmailThreadId !== candidate.gmailThreadId ||
        imported.subject !== candidate.subject ||
        imported.senderDomain !== candidate.senderDomain ||
        imported.receivedAt !== candidate.receivedAt
      ) throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      const requestSha256 = await sha256(JSON.stringify({
        version: 1,
        action: "import_historical_provider_gmail",
        organizationId,
        actorSubject: identity.subject,
        candidateId: input.candidateId,
        criteria: input.criteria,
      }));
      const claim = await historicalImportStore.record({
        organizationId,
        mailboxEmail: "carriers@xbfreight.com",
        gmailMessageId: imported.gmailMessageId,
        gmailThreadId: imported.gmailThreadId,
        subjectSha256: await sha256(imported.subject),
        senderDomain: imported.senderDomain,
        receivedAt: imported.receivedAt,
        actorSubject: identity.subject,
        idempotencyKey: input.idempotencyKey,
        requestSha256,
        providerMessageInserted: imported.inserted,
        attachmentMetadataRows: imported.attachmentCount,
      });
      return {
        candidateId: imported.gmailMessageId,
        claimId: claim.claimId,
        importStatus: claim.status,
        attachmentMetadataRows: claim.attachmentMetadataRows,
        ospEnqueued: claim.ospEnqueued,
        ospProcessed: 0,
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
