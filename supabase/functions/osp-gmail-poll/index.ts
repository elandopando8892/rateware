import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import postgres from "npm:postgres@3.4.7";

import { providerGmailAllowedAccount } from "../_shared/provider-gmail.ts";
import {
  requireProviderGmailConnection,
  syncProviderGmailConnection,
} from "../_shared/provider-gmail-sync.ts";
import {
  triggerOspGmailWorker,
  triggerOspSupplierPackageCanary,
} from "../_shared/osp/worker-trigger.ts";
import { OSP_PRODUCTION_ORGANIZATION_BINDING } from "../osp-read-api/auth-policy.ts";
import {
  createScheduledGmailPollHandler,
  ScheduledGmailPollDependencyError,
  type ScheduledGmailPollFailureCode,
  type ScheduledGmailPollReceipt,
} from "./handler.ts";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return value;
}

function origin(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")
  ) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return parsed.origin;
}

function databaseConnection(value: string): string {
  const parsed = new URL(value);
  const sslMode = parsed.searchParams.get("sslmode");
  const allowedQuery = parsed.searchParams.size === 1 &&
    ["require", "prefer"].includes(sslMode ?? "");
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname || (parsed.search && !allowedQuery) || parsed.hash
  ) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return value.replace(/\?sslmode=(?:require|prefer)$/, "");
}

let runtime: (request: Request) => Promise<Response>;
try {
  const supabaseUrl = origin(required("SUPABASE_URL"));
  const serviceRoleKey = required("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
  const expectedToken = required("OSP_GMAIL_POLL_SECRET");
  if (expectedToken.length < 32) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = postgres(databaseConnection(required("SUPABASE_DB_URL")), {
    max: 1,
    prepare: false,
  });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const organizationId =
    OSP_PRODUCTION_ORGANIZATION_BINDING.canonicalOrganization;

  runtime = createScheduledGmailPollHandler({
    expectedToken,
    runSupplierPackageCanary: async (input) => {
      try {
        return await triggerOspSupplierPackageCanary({
          supabaseUrl,
          serviceRoleKey,
          ...input,
        });
      } catch {
        throw new ScheduledGmailPollDependencyError("POLL_WORKER_UNAVAILABLE");
      }
    },
    drain: async () => {
      try {
        return await triggerOspGmailWorker({
          supabaseUrl,
          serviceRoleKey,
          limit: 10,
        });
      } catch {
        throw new ScheduledGmailPollDependencyError("POLL_WORKER_UNAVAILABLE");
      }
    },
    claim: async () => {
      const rows = await sql`
        update osp_private.production_controls
        set gmail_poll_last_started_at = statement_timestamp(),
            gmail_poll_last_status = 'running',
            gmail_poll_last_error_code = null,
            gmail_poll_lease_id = gen_random_uuid()
        where id = 'singleton'
          and gmail_poll_enabled
          and (
            gmail_poll_last_status <> 'running'
            or gmail_poll_last_started_at < statement_timestamp() - interval '10 minutes'
          )
        returning gmail_poll_lease_id::text
      `;
      if (rows.length === 1) {
        return {
          status: "claimed" as const,
          leaseId: String(rows[0].gmail_poll_lease_id),
        };
      }
      const control = await sql`
        select gmail_poll_enabled, gmail_poll_last_status
        from osp_private.production_controls where id = 'singleton'
      `;
      return {
        status: control[0]?.gmail_poll_enabled === true
          ? "busy" as const
          : "disabled" as const,
      };
    },
    poll: async () => {
      const selected = await supabase.from("provider_gmail_connections")
        .select("legal_entity_id")
        .eq("organization_id", organizationId)
        .eq("purpose", "provider_onboarding")
        .eq("mailbox_email", providerGmailAllowedAccount())
        .in("status", ["connected", "watching"])
        .limit(2);
      if (selected.error || selected.data?.length !== 1) {
        throw new ScheduledGmailPollDependencyError(
          "POLL_GMAIL_CONNECTION_UNAVAILABLE",
        );
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
          trigger: "osp_scheduled_poll",
        },
      );
      let worker: Awaited<ReturnType<typeof triggerOspGmailWorker>>;
      try {
        worker = await triggerOspGmailWorker({
          supabaseUrl,
          serviceRoleKey,
          limit: 10,
        });
      } catch {
        throw new ScheduledGmailPollDependencyError("POLL_WORKER_UNAVAILABLE");
      }
      return {
        discovered: Number(synced.data.discovered),
        insertedMessages: Number(synced.data.inserted_messages),
        duplicates: Number(synced.data.duplicates),
        attachmentMetadataRows: Number(synced.data.attachment_metadata_rows),
        ospEnqueued: worker.enqueued,
        ospProcessed: worker.processed,
      };
    },
    complete: async (receipt: ScheduledGmailPollReceipt, leaseId: string) => {
      await sql`
        update osp_private.production_controls
        set gmail_poll_last_completed_at = statement_timestamp(),
            gmail_poll_last_status = 'succeeded',
            gmail_poll_last_error_code = null,
            gmail_poll_lease_id = null,
            gmail_poll_consecutive_failures = 0,
            gmail_poll_last_receipt = ${
        sql.json({
          discovered: receipt.discovered,
          inserted_messages: receipt.insertedMessages,
          duplicates: receipt.duplicates,
          attachment_metadata_rows: receipt.attachmentMetadataRows,
          osp_enqueued: receipt.ospEnqueued,
          osp_processed: receipt.ospProcessed,
        })
      }
        where id = 'singleton' and gmail_poll_last_status = 'running' and gmail_poll_lease_id = ${leaseId}::uuid
      `;
    },
    fail: async (errorCode: ScheduledGmailPollFailureCode, leaseId: string) => {
      await sql`
        update osp_private.production_controls
        set gmail_poll_last_completed_at = statement_timestamp(),
            gmail_poll_last_status = 'failed',
            gmail_poll_last_error_code = ${errorCode},
            gmail_poll_lease_id = null,
            gmail_poll_consecutive_failures = least(gmail_poll_consecutive_failures + 1, 2147483647)
        where id = 'singleton' and gmail_poll_last_status = 'running' and gmail_poll_lease_id = ${leaseId}::uuid
      `;
    },
  });
} catch (error) {
  console.error(
    "OSP_GMAIL_POLL_BOOT_FAILED",
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
