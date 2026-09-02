import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createOspWorkerHandler } from "./handler.ts";

const token = "s".repeat(64);
const manualToken = "m".repeat(64);
const canary = {
  action: "run_xlsx_document_extract_canary",
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  documentVersionId: "44444444-4444-4444-8444-444444444444",
  sourceSha256: "a".repeat(64),
};
const packageCanary = {
  action: "run_supplier_package_canary",
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  snapshotId: "33333333-3333-4333-8333-333333333333",
  snapshotSha256: "b".repeat(64),
};
const signatureCanary = {
  action: "run_signature_application_canary",
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  approvalId: "44444444-4444-4444-8444-444444444444",
  expectedCaseVersion: 10,
  inputSnapshotSha256: "c".repeat(64),
  inputPackageSha256: "d".repeat(64),
  signaturePositionVersion: 1,
};
const exactSend = {
  action: "run_authorized_send_exact",
  organizationId: "11111111-1111-4111-8111-111111111111",
  authorizationId: "22222222-2222-4222-8222-222222222222",
  attemptId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
  leaseToken: "55555555-5555-4555-8555-555555555555",
};
const manifestCanary = {
  action: "run_request_manifest_shadow",
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  gmailMessageId: "33333333-3333-4333-8333-333333333333",
  gmailSourceSha256: "e".repeat(64),
  documentVersionId: "44444444-4444-4444-8444-444444444444",
  documentSourceSha256: "f".repeat(64),
};
const manifestDraftCanary = {
  action: "run_request_manifest_canary",
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
};
const manualRequestCanary = {
  action: "run_manual_request_canary",
  organizationId: "11111111-1111-4111-8111-111111111111",
  pdfSha256: "a".repeat(64),
  docxSha256: "b".repeat(64),
  pdfBase64: btoa(String.fromCharCode(1, 2, 3)),
  docxBase64: btoa(String.fromCharCode(4, 5, 6)),
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

Deno.test("OSP worker accepts one exact manual PDF and DOCX canary only with its temporary token", async () => {
  let received: Record<string, unknown> | undefined;
  const handler = createOspWorkerHandler({
    expectedToken: token,
    manualCanaryToken: manualToken,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runManualRequestCanary: async (input) => {
      received = input;
      return {
        caseId: "22222222-2222-4222-8222-222222222222",
        externalEffects: false,
      };
    },
  });
  assertEquals((await handler(request(manualRequestCanary))).status, 401);
  const response = await handler(
    request(manualRequestCanary, `Bearer ${manualToken}`),
  );
  assertEquals(response.status, 200);
  assertEquals((received?.pdfBytes as Uint8Array).byteLength, 3);
  assertEquals((received?.docxBytes as Uint8Array).byteLength, 3);
  assertEquals(
    (await handler(
      request({ ...manualRequestCanary, extra: true }, `Bearer ${manualToken}`),
    )).status,
    400,
  );
  assertEquals(
    (await handler(
      request({ action: "drain_rateware_gmail" }, `Bearer ${manualToken}`),
    )).status,
    401,
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

Deno.test("OSP worker executes only the exact leased authorized send", async () => {
  let received: Record<string, string> | undefined;
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runAuthorizedSendExact: async (input) => {
      received = input;
      return { outcome: "sent", replayed: false };
    },
  });
  const response = await handler(request(exactSend));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { outcome: "sent", replayed: false });
  assertEquals(received, {
    organizationId: exactSend.organizationId,
    authorizationId: exactSend.authorizationId,
    attemptId: exactSend.attemptId,
    jobId: exactSend.jobId,
    leaseToken: exactSend.leaseToken,
  });
  assertEquals(
    (await handler(request({ ...exactSend, extra: true }))).status,
    400,
  );
});

Deno.test("OSP worker fails closed when exact send is disabled", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  const response = await handler(request(exactSend));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "EXACT_SEND_DISABLED" });
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

Deno.test("OSP worker runs only one exact read-only request manifest shadow", async () => {
  let received: Record<string, string> | undefined;
  const result = {
    manifest: { schemaVersion: 1 },
    telemetry: { totalTokens: 150 },
    evidence: { count: 3 },
  };
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runRequestManifestShadow: async (input) => {
      received = input;
      return result;
    },
  });
  const response = await handler(request(manifestCanary));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), result);
  assertEquals(received, {
    organizationId: manifestCanary.organizationId,
    caseId: manifestCanary.caseId,
    gmailMessageId: manifestCanary.gmailMessageId,
    gmailSourceSha256: manifestCanary.gmailSourceSha256,
    documentVersionId: manifestCanary.documentVersionId,
    documentSourceSha256: manifestCanary.documentSourceSha256,
  });
  assertEquals(
    (await handler(request({ ...manifestCanary, extra: true }))).status,
    400,
  );
});

Deno.test("OSP worker fails closed when request manifest shadow is disabled", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  const response = await handler(request(manifestCanary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_DISABLED" });
});

Deno.test("OSP worker runs only the exact multimodal manifest canary", async () => {
  let received: Record<string, string> | undefined;
  const result = { status: "review_required", externalEffects: false };
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runRequestManifestCanary: async (input) => {
      received = input;
      return result;
    },
  });
  const response = await handler(request(manifestDraftCanary));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), result);
  assertEquals(received, {
    organizationId: manifestDraftCanary.organizationId,
    caseId: manifestDraftCanary.caseId,
  });
  assertEquals(
    (await handler(request({ ...manifestDraftCanary, extra: true }))).status,
    400,
  );
});

Deno.test("OSP worker fails closed when multimodal manifest canary is disabled", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  const response = await handler(request(manifestDraftCanary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_DISABLED" });
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
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "INVALID_REQUEST" });
});

Deno.test("OSP worker runs only one exact supplier package canary", async () => {
  let received: Record<string, string> | undefined;
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runSupplierPackageCanary: async (input) => {
      received = input;
      return 1;
    },
  });
  const response = await handler(request(packageCanary));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { processed: 1 });
  assertEquals(received, {
    organizationId: packageCanary.organizationId,
    caseId: packageCanary.caseId,
    snapshotId: packageCanary.snapshotId,
    snapshotSha256: packageCanary.snapshotSha256,
  });

  const ambiguous = await handler(request({ ...packageCanary, extra: true }));
  assertEquals(ambiguous.status, 400);
});

Deno.test("manual canary credentials cannot run a supplier package", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    manualCanaryToken: manualToken,
    enqueue: async () => 0,
    run: async () => 0,
    runSupplierPackageCanary: async () => 1,
  });
  const response = await handler(
    request(packageCanary, `Bearer ${manualToken}`),
  );
  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "UNAUTHORIZED" });
});

Deno.test("OSP worker fails closed when supplier package canary is disabled or not ready", async () => {
  const disabled = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  let response = await disabled(request(packageCanary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_DISABLED" });

  const unavailable = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
    runSupplierPackageCanary: async () => 0,
  });
  response = await unavailable(request(packageCanary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_NOT_READY" });
});

Deno.test("OSP worker runs only one exact signature application canary", async () => {
  let received: Record<string, string | number> | undefined;
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    run: () => Promise.reject(new Error("GLOBAL_QUEUE_CALLED")),
    runSignatureApplicationCanary: async (input) => {
      received = input;
      return 1;
    },
  });
  const response = await handler(request(signatureCanary));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { processed: 1 });
  assertEquals(received, {
    organizationId: signatureCanary.organizationId,
    caseId: signatureCanary.caseId,
    jobId: signatureCanary.jobId,
    approvalId: signatureCanary.approvalId,
    expectedCaseVersion: 10,
    inputSnapshotSha256: signatureCanary.inputSnapshotSha256,
    inputPackageSha256: signatureCanary.inputPackageSha256,
    signaturePositionVersion: 1,
  });
  assertEquals(
    (await handler(request({ ...signatureCanary, extra: true }))).status,
    400,
  );
});

Deno.test("OSP worker fails closed when signature canary is disabled or not ready", async () => {
  const disabled = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  let response = await disabled(request(signatureCanary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_DISABLED" });

  const unavailable = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
    runSignatureApplicationCanary: async () => 0,
  });
  response = await unavailable(request(signatureCanary));
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "CANARY_NOT_READY" });
});
