import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import postgres from "npm:postgres@3.4.7";

import {
  requireProviderGmailConnection,
  syncProviderGmailConnection,
} from "../_shared/provider-gmail-sync.ts";
import { triggerOspGmailWorker } from "../_shared/osp/worker-trigger.ts";
import { OSP_PRODUCTION_ORGANIZATION_BINDING } from "../osp-read-api/auth-policy.ts";
import { OspApiError } from "../osp-read-api/http.ts";
import { createKindeJwtVerifier } from "../osp-read-api/kinde-jwt.ts";
import { createPostgresOspReadStore } from "../osp-read-api/postgres-store.ts";
import { createOspGmailSyncHandler } from "./handler.ts";

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
  const store = createPostgresOspReadStore({
    databaseUrl: Deno.env.get("OSP_READ_DATABASE_URL")?.trim() ||
      required("SUPABASE_DB_URL"),
    postgresFactory: postgres,
  });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  runtime = createOspGmailSyncHandler({
    verifyToken: (token, signal) => verifier.verify(token, signal),
    resolveWorkspace: (identity, signal) =>
      store.resolveWorkspace(identity, signal),
    syncInbox: async (organizationId) => {
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
      const connection = await requireProviderGmailConnection(
        supabase,
        organizationId,
        selected.data[0].legal_entity_id,
      );
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
