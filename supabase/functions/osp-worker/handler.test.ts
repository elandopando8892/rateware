import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createOspWorkerHandler } from "./handler.ts";

const token = "s".repeat(64);
const canary = {
  action: "run_xlsx_document_extract_canary",
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  documentVersionId: "44444444-4444-4444-8444-444444444444",
  sourceSha256: "a".repeat(64),
};
const request = (body: unknown, authorization = `Bearer ${token}`) =>
  new Request("https://example.test/functions/v1/osp-worker", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

Deno.test("OSP worker rejects unauthorized and ambiguous requests", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  assertEquals((await handler(request({}, "Bearer invalid"))).status, 401);
  assertEquals(
    (await handler(request({ action: "drain_rateware_gmail", extra: true })))
      .status,
    400,
  );
  assertEquals(
    (await handler(request({ action: "drain_rateware_gmail", limit: 26 })))
      .status,
    400,
  );
});

Deno.test("OSP worker enqueues once and drains bounded batches", async () => {
  const limits: number[] = [];
  const batches = [10, 10, 3];
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async (limit) => {
      limits.push(limit);
      return 7;
    },
    run: async (limit) => {
      limits.push(limit);
      return batches.shift() ?? 0;
    },
  });
  const response = await handler(
    request({ action: "drain_rateware_gmail", limit: 10 }),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    enqueued: 7,
    processed: 23,
    batches: 3,
  });
  assertEquals(limits, [10, 10, 10, 10]);
});

Deno.test("OSP worker fails closed when the bridge is unavailable", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => {
      throw new Error("DATABASE_TEMPORARY");
    },
    run: async () => 0,
  });
  const response = await handler(request({ action: "drain_rateware_gmail" }));
  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: "WORKER_UNAVAILABLE" });
});

Deno.test("OSP worker runs one exact XLSX extraction canary", async () => {
  let received: Record<string, string> | undefined;
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runXlsxDocumentExtractCanary: async (input) => {
      received = input;
      return 1;
    },
  });
  const response = await handler(request(canary));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { processed: 1 });
  assertEquals(received, {
    organizationId: canary.organizationId,
    caseId: canary.caseId,
    jobId: canary.jobId,
    documentVersionId: canary.documentVersionId,
    sourceSha256: canary.sourceSha256,
  });
});

Deno.test("OSP worker stages one exact XLSX quote canary in Rateware review", async () => {
  let received: Record<string, string> | undefined;
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    stageXlsxRatewareCanary: async (request) => {
      received = request;
      return {
        rawUploadId: "55555555-5555-4555-8555-555555555555",
        interpretationJobId: "66666666-6666-4666-8666-666666666666",
        rateStagingId: "77777777-7777-4777-8777-777777777777",
        inserted: true,
      };
    },
  });
  const response = await handler(request({
    ...canary,
    action: "stage_xlsx_rateware_canary",
  }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    rawUploadId: "55555555-5555-4555-8555-555555555555",
    interpretationJobId: "66666666-6666-4666-8666-666666666666",
    rateStagingId: "77777777-7777-4777-8777-777777777777",
    inserted: true,
  });
  assertEquals(received?.documentVersionId, canary.documentVersionId);
});

Deno.test("OSP worker fails closed when the XLSX canary is disabled or not ready", async () => {
  const disabled = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  let response = await disabled(request(canary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_DISABLED" });

  const unavailable = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
    runXlsxDocumentExtractCanary: async () => 0,
  });
  response = await unavailable(request(canary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_NOT_READY" });

  response = await unavailable(request({ ...canary, extra: true }));
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "INVALID_REQUEST" });

  response = await unavailable(request({
    ...canary,
    action: "stage_xlsx_rateware_canary",
  }));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_DISABLED" });
});
