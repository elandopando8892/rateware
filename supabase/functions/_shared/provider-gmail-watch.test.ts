import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { renewProviderGmailWatch } from "./provider-gmail-watch.ts";

const NOW = Date.parse("2030-01-01T00:00:00.000Z");
const EXPIRATION = NOW + 6 * 24 * 60 * 60 * 1000;

function fakeSupabase(error: unknown = null) {
  const updates: Record<string, unknown>[] = [];
  const filters: [string, unknown][] = [];
  return {
    updates,
    filters,
    client: {
      from(table: string) {
        assertEquals(table, "provider_gmail_connections");
        return {
          update(value: Record<string, unknown>) {
            updates.push(value);
            return {
              eq(column: string, value: unknown) {
                filters.push([column, value]);
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    filters.push([nextColumn, nextValue]);
                    return Promise.resolve({ error });
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

Deno.test("renewProviderGmailWatch starts one INBOX-only watch and persists its receipt", async () => {
  const database = fakeSupabase();
  const gmailRequests: { token: string; path: string; init: RequestInit }[] =
    [];
  const receipt = await renewProviderGmailWatch(
    database.client,
    "11111111-1111-4111-8111-111111111111",
    {
      id: "connection-a",
      mailbox_email: "CARRIERS@XBFREIGHT.COM",
      legal_entity_id: "22222222-2222-4222-8222-222222222222",
    },
    "projects/synthetic-project/topics/osp-gmail",
    {
      getAccessToken: async () => "access-token",
      requestGmailJson: async (token, path, init) => {
        gmailRequests.push({ token, path, init: init ?? {} });
        return { historyId: "57490", expiration: String(EXPIRATION) };
      },
      now: () => NOW,
    },
  );

  const gmailRequest = gmailRequests[0];
  assert(gmailRequest);
  assertEquals(gmailRequest.token, "access-token");
  assertEquals(gmailRequest.path, "/watch");
  assertEquals(gmailRequest.init.method, "POST");
  assertEquals(JSON.parse(String(gmailRequest.init.body)), {
    topicName: "projects/synthetic-project/topics/osp-gmail",
    labelIds: ["INBOX"],
    labelFilterBehavior: "INCLUDE",
  });
  assertEquals(receipt, {
    mailboxEmail: "carriers@xbfreight.com",
    legalEntityId: "22222222-2222-4222-8222-222222222222",
    historyId: "57490",
    watchExpirationAt: new Date(EXPIRATION).toISOString(),
  });
  assertEquals(database.updates, [{
    status: "watching",
    history_id: "57490",
    watch_expiration_at: new Date(EXPIRATION).toISOString(),
    last_error: null,
    updated_at: new Date(NOW).toISOString(),
  }]);
  assertEquals(database.filters, [
    ["organization_id", "11111111-1111-4111-8111-111111111111"],
    ["id", "connection-a"],
  ]);
});

Deno.test("renewProviderGmailWatch fails closed on absent config or stale Gmail receipt", async () => {
  const database = fakeSupabase();
  const getAccessToken = async () => "access-token";
  await assertRejects(
    () =>
      renewProviderGmailWatch(database.client, "organization-a", {}, null, {
        getAccessToken,
        now: () => NOW,
      }),
    Error,
    "PROVIDER_GMAIL_PUBSUB_TOPIC is not configured",
  );
  await assertRejects(
    () =>
      renewProviderGmailWatch(
        database.client,
        "organization-a",
        {},
        "projects/synthetic-project/topics/osp-gmail",
        {
          getAccessToken,
          requestGmailJson: async () => ({
            historyId: "57490",
            expiration: String(NOW),
          }),
          now: () => NOW,
        },
      ),
    Error,
    "Gmail watch response was incomplete",
  );
  assertEquals(database.updates, []);
});
