import { assert } from "jsr:@std/assert@1.0.14";

import type { OspAuthorizationIdentity } from "../osp-read-api/auth-policy.ts";
import { createOspGmailSyncHandler } from "./handler.ts";

const identity: OspAuthorizationIdentity = {
  issuer: "https://auth.heymarksman.com",
  authorizedParty: "osp-client",
  subject: "subject-a",
  organization: "ca0a8f30-1382-4316-9bd5-cb76d9ab4920",
  email: "jgonzalez@xbfreight.com",
  emailVerified: true,
};

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(
    "https://project.example/functions/v1/osp-gmail-sync-api",
    {
      method: "POST",
      headers: {
        origin: "https://osp.heymarksman.com",
        authorization: "Bearer exact-token",
        "content-type": "application/json",
        ...headers,
      },
      body,
    },
  );
}

Deno.test("manual Gmail sync authenticates before one bounded workspace sync and returns safe counts", async () => {
  const calls: string[] = [];
  const handler = createOspGmailSyncHandler({
    verifyToken: async (token) => {
      calls.push(`verify:${token}`);
      return identity;
    },
    resolveWorkspace: async (actor) => {
      calls.push(`workspace:${actor.subject}`);
      return actor.organization;
    },
    syncInbox: async (organizationId) => {
      calls.push(`sync:${organizationId}`);
      return {
        discovered: 2,
        insertedMessages: 1,
        duplicates: 1,
        attachmentMetadataRows: 3,
        ospEnqueued: 1,
        ospProcessed: 1,
      };
    },
    renewWatch: async () => ({
      watchExpiresAt: "2030-01-07T00:00:00.000Z",
    }),
    previewHistoricalInbox: async () => ({ query: "in:inbox", candidates: [] }),
    incidentId: () => "incident-test",
  });
  const response = await handler(
    request(
      JSON.stringify({ version: 1, action: "sync_provider_gmail_inbox" }),
    ),
  );
  assert(response.status === 200);
  assert(
    response.headers.get("access-control-allow-origin") ===
      "https://osp.heymarksman.com",
  );
  assert(response.headers.get("cache-control") === "no-store");
  assert(
    JSON.stringify(await response.json()) === JSON.stringify({
      version: 1,
      data: {
        discovered: 2,
        inserted_messages: 1,
        duplicates: 1,
        attachment_metadata_rows: 3,
        osp_enqueued: 1,
        osp_processed: 1,
        outbound_enabled: false,
      },
    }),
  );
  assert(
    calls.join("|") ===
      `verify:exact-token|workspace:subject-a|sync:${identity.organization}`,
  );
});

Deno.test("manual Gmail sync rejects extra actions, disallowed origins and missing bearer without syncing", async () => {
  let syncs = 0;
  const handler = createOspGmailSyncHandler({
    verifyToken: async () => identity,
    resolveWorkspace: async () => identity.organization,
    syncInbox: async () => {
      syncs += 1;
      return {
        discovered: 0,
        insertedMessages: 0,
        duplicates: 0,
        attachmentMetadataRows: 0,
        ospEnqueued: 0,
        ospProcessed: 0,
      };
    },
    renewWatch: async () => ({
      watchExpiresAt: "2030-01-07T00:00:00.000Z",
    }),
    previewHistoricalInbox: async () => ({ query: "in:inbox", candidates: [] }),
    incidentId: () => "incident-test",
  });
  const invalidBody = await handler(
    request(
      JSON.stringify({
        version: 1,
        action: "sync_provider_gmail_inbox",
        limit: 100,
      }),
    ),
  );
  assert(invalidBody.status === 400);
  const invalidOrigin = await handler(
    request(
      JSON.stringify({ version: 1, action: "sync_provider_gmail_inbox" }),
      { origin: "https://evil.example" },
    ),
  );
  assert(invalidOrigin.status === 403);
  const missingBearer = await handler(
    request(
      JSON.stringify({ version: 1, action: "sync_provider_gmail_inbox" }),
      { authorization: "" },
    ),
  );
  assert(missingBearer.status === 401);
  assert(syncs === 0);
});

Deno.test("manual Gmail sync maps dependency details to a safe unavailable error", async () => {
  const handler = createOspGmailSyncHandler({
    verifyToken: async () => identity,
    resolveWorkspace: async () => identity.organization,
    syncInbox: async () => {
      throw new Error("secret provider token failed");
    },
    renewWatch: async () => ({
      watchExpiresAt: "2030-01-07T00:00:00.000Z",
    }),
    previewHistoricalInbox: async () => ({ query: "in:inbox", candidates: [] }),
    incidentId: () => "incident-safe",
  });
  const response = await handler(
    request(
      JSON.stringify({ version: 1, action: "sync_provider_gmail_inbox" }),
    ),
  );
  assert(response.status === 503);
  assert(
    JSON.stringify(await response.json()) ===
      JSON.stringify({
        error: { code: "DEPENDENCY_UNAVAILABLE", incident_id: "incident-safe" },
      }),
  );
});

Deno.test("Gmail watch renewal uses the same exact authorization seam and returns only safe state", async () => {
  const calls: string[] = [];
  const handler = createOspGmailSyncHandler({
    verifyToken: async (token) => {
      calls.push(`verify:${token}`);
      return identity;
    },
    resolveWorkspace: async (actor) => {
      calls.push(`workspace:${actor.subject}`);
      return actor.organization;
    },
    syncInbox: async () => {
      throw new Error("must not sync");
    },
    renewWatch: async (organizationId) => {
      calls.push(`watch:${organizationId}`);
      return { watchExpiresAt: "2030-01-07T00:00:00.000Z" };
    },
    previewHistoricalInbox: async () => ({ query: "in:inbox", candidates: [] }),
    incidentId: () => "incident-watch",
  });
  const response = await handler(
    request(
      JSON.stringify({ version: 1, action: "renew_provider_gmail_watch" }),
    ),
  );
  assert(response.status === 200);
  assert(
    JSON.stringify(await response.json()) ===
      JSON.stringify({
        version: 1,
        data: {
          watch_configured: true,
          watch_expires_at: "2030-01-07T00:00:00.000Z",
          outbound_enabled: false,
        },
      }),
  );
  assert(
    calls.join("|") ===
      `verify:exact-token|workspace:subject-a|watch:${identity.organization}`,
  );
});

Deno.test("historical Gmail preflight is bounded, read-only and returns safe candidate metadata", async () => {
  const calls: string[] = [];
  const handler = createOspGmailSyncHandler({
    verifyToken: async () => identity,
    resolveWorkspace: async () => identity.organization,
    syncInbox: async () => {
      throw new Error("must not sync");
    },
    renewWatch: async () => {
      throw new Error("must not watch");
    },
    previewHistoricalInbox: async (organizationId, criteria) => {
      calls.push(
        `${organizationId}:${criteria.afterDate}:${criteria.beforeDate}:${criteria.subjectPhrase}`,
      );
      return {
        query: 'in:inbox subject:"Salzillo" after:2026/08/09 before:2026/08/12',
        candidates: [{
          candidateId: "message_1",
          subject: "PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN",
          senderDomain: "example.test",
          receivedAt: "2026-08-10T15:00:00.000Z",
          attachmentCount: 1,
          duplicateState: "ready",
        }],
      };
    },
    incidentId: () => "incident-history",
  });
  const response = await handler(request(JSON.stringify({
    version: 1,
    action: "preview_historical_provider_gmail",
    subject_phrase: "PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN",
    after_date: "2026-08-09",
    before_date: "2026-08-12",
  })));
  assert(response.status === 200);
  const body = await response.json();
  assert(body.data.candidates[0].candidate_id === "message_1");
  assert(body.data.checkpoint_unchanged === true);
  assert(body.data.persisted === false);
  assert(body.data.outbound_enabled === false);
  assert(calls.length === 1);
});
