import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.14";

import {
  buildProviderGmailHistoricalQuery,
  searchProviderGmailHistoricalInbox,
} from "./provider-gmail-historical.ts";

const criteria = {
  subjectPhrase: "PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN",
  afterDate: "2026-08-09",
  beforeDate: "2026-08-12",
};

Deno.test("historical Gmail recovery builds one bounded mailbox query", () => {
  assertEquals(
    buildProviderGmailHistoricalQuery(criteria),
    'in:anywhere subject:"PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN" after:2026/08/09 before:2026/08/12',
  );
  assertThrows(
    () =>
      buildProviderGmailHistoricalQuery({
        ...criteria,
        beforeDate: "2026-10-12",
      }),
    Error,
    "INVALID_HISTORICAL_SEARCH",
  );
  assertThrows(
    () =>
      buildProviderGmailHistoricalQuery({
        ...criteria,
        subjectPhrase: 'x" OR newer_than:1d',
      }),
    Error,
    "INVALID_HISTORICAL_SEARCH",
  );
});

Deno.test("historical Gmail recovery reads safe candidate metadata without history mutation", async () => {
  const paths: string[] = [];
  const result = await searchProviderGmailHistoricalInbox(
    "read-only-token",
    criteria,
    async (_token, path) => {
      paths.push(path);
      if (path.startsWith("/messages?")) {
        return {
          messages: [{ id: "message_1" }, { id: "message_1" }, {
            id: "message_2",
          }],
        };
      }
      if (path.includes("message_1")) {
        return {
          id: "message_1",
          threadId: "thread_1",
          internalDate: String(Date.parse("2026-08-10T15:00:00.000Z")),
          labelIds: [],
          payload: {
            headers: [
              { name: "Subject", value: criteria.subjectPhrase },
              { name: "From", value: "Customer Setup <setup@example.test>" },
            ],
            parts: [{
              filename: "Alta Cliente.xlsm",
              body: { attachmentId: "attachment_1" },
            }],
          },
        };
      }
      return {
        id: "message_2",
        threadId: "thread_2",
        internalDate: String(Date.parse("2026-08-10T16:00:00.000Z")),
        labelIds: ["SENT"],
        payload: { headers: [] },
      };
    },
  );
  assertEquals(result.candidates, [{
    gmailMessageId: "message_1",
    gmailThreadId: "thread_1",
    subject: criteria.subjectPhrase,
    senderDomain: "example.test",
    receivedAt: "2026-08-10T15:00:00.000Z",
    attachmentCount: 1,
  }]);
  assertEquals(paths.length, 3);
  assertEquals(paths.some((path) => path.startsWith("/history")), false);
});

Deno.test("historical Gmail recovery fails closed when Gmail cannot be read", async () => {
  await assertRejects(
    () =>
      searchProviderGmailHistoricalInbox("token", criteria, async () => {
        throw new Error("provider unavailable");
      }),
    Error,
    "provider unavailable",
  );
});
