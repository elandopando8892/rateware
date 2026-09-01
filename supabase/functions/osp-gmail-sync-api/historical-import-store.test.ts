import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";

import { createPostgresHistoricalImportStore } from "./historical-import-store.ts";

Deno.test("historical import store scopes one exact idempotent claim through the workflow role", async () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replaceAll(/\s+/g, " ").trim();
      calls.push({ text, values });
      if (/record_historical_gmail_import/.test(text)) {
        return [{
          claim_id: "97000000-0000-4000-8000-000000000001",
          import_status: "imported",
          osp_enqueued: 1,
          attachment_metadata_rows: 1,
        }];
      }
      return [];
    },
    { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) },
  );
  const store = createPostgresHistoricalImportStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  const result = await store.record({
    organizationId: "ca0a8f30-1382-4316-9bd5-cb76d9ab4920",
    mailboxEmail: "carriers@xbfreight.com",
    gmailMessageId: "message_1",
    gmailThreadId: "thread_1",
    subjectSha256: "a".repeat(64),
    senderDomain: "xbfreight.com",
    receivedAt: "2026-08-10T15:00:00.000Z",
    actorSubject: "sales-subject",
    idempotencyKey: "historical_gmail:one",
    requestSha256: "b".repeat(64),
    providerMessageInserted: true,
    attachmentMetadataRows: 1,
  });
  assertEquals(result, {
    claimId: "97000000-0000-4000-8000-000000000001",
    status: "imported",
    ospEnqueued: 1,
    attachmentMetadataRows: 1,
  });
  assertEquals(calls[0], { text: "set local role osp_workflow_api", values: [] });
  assertMatch(calls[2].text, /osp_private\.record_historical_gmail_import/);
  assertEquals(calls[2].values[0], "ca0a8f30-1382-4316-9bd5-cb76d9ab4920");
  assertEquals(calls[2].values[8], "historical_gmail:one");
});
