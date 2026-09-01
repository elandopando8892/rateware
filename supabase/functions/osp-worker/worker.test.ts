import { assertEquals } from "jsr:@std/assert@1.0.14";

import { deterministicRetryAt, runWorker } from "./worker.ts";
import { createInMemoryBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import { IntakeStageError } from "./intake-service.ts";

Deno.test("worker reports a safe intake stage while preserving retry classification", async () => {
  const reports: unknown[] = [];
  const failures: unknown[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-22T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-stage",
        organizationId: "org-1",
        kind: "gmail_ingest",
        opaquePayload: {
          gmailMessageId: "message_1",
          deliveryIdempotencyKey: "delivery_1",
        },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-22T00:05:00.000Z",
      }],
      complete: async () => undefined,
      fail: async (input) => {
        failures.push(input);
      },
    },
    intake: {
      ingest: async () => {
        throw new IntakeStageError(
          "raw_store",
          new Error("STORAGE_TEMPORARY"),
        );
      },
      refreshDuplicateReview: async () => undefined,
    },
    reportFailure: (input) => reports.push(input),
  });
  assertEquals(reports, [{
    jobId: "job-stage",
    kind: "gmail_ingest",
    attempt: 1,
    code: "STORAGE_TEMPORARY",
    stage: "raw_store",
    errorName: "Error",
    diagnosticCode: "STORAGE_TEMPORARY",
  }]);
  assertEquals(
    (failures[0] as { errorCode: string }).errorCode,
    "STORAGE_TEMPORARY",
  );
});

Deno.test("worker persists the safe intake stage for an unknown terminal failure", async () => {
  const failures: unknown[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-22T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-terminal-stage",
        organizationId: "org-1",
        kind: "gmail_ingest",
        opaquePayload: {
          gmailMessageId: "message_1",
          deliveryIdempotencyKey: "delivery_1",
        },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-22T00:05:00.000Z",
      }],
      complete: async () => undefined,
      fail: async (input) => {
        failures.push(input);
      },
    },
    intake: {
      ingest: async () => {
        throw new IntakeStageError("mime_parse", new TypeError("opaque"));
      },
      refreshDuplicateReview: async () => undefined,
    },
    reportFailure: () => undefined,
  });
  assertEquals(
    (failures[0] as { errorCode: string }).errorCode,
    "MIME_PARSE_FAILURE",
  );
});

Deno.test("worker preserves a deterministic XLSX policy rejection", async () => {
  const failures: unknown[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-xlsx-policy",
        organizationId: "org-1",
        kind: "gmail_ingest",
        opaquePayload: {
          gmailMessageId: "message_1",
          deliveryIdempotencyKey: "delivery_1",
        },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-28T00:05:00.000Z",
      }],
      complete: async () => undefined,
      fail: async (input) => {
        failures.push(input);
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "case-1",
        eventId: "event-1",
      }),
      refreshDuplicateReview: async () => undefined,
    },
    attachmentPromotions: {
      promoteCase: async () => {
        throw new Error("MALWARE_SCAN_REJECTED");
      },
    },
  });
  assertEquals(
    (failures[0] as { errorCode: string }).errorCode,
    "MALWARE_SCAN_REJECTED",
  );
});

Deno.test("worker retries only bounded temporary errors with deterministic capped backoff", async () => {
  assertEquals(
    deterministicRetryAt(new Date("2026-08-22T00:00:00.000Z"), 1).toISOString(),
    "2026-08-22T00:00:05.000Z",
  );
  assertEquals(
    deterministicRetryAt(new Date("2026-08-22T00:00:00.000Z"), 4).toISOString(),
    "2026-08-22T00:00:40.000Z",
  );
  const failures: unknown[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-22T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-1",
        organizationId: "org-1",
        kind: "gmail_ingest",
        opaquePayload: { gmailMessageId: "message_1" },
        attempt: 4,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-22T00:05:00.000Z",
      }],
      complete: async () => undefined,
      fail: async (input) => {
        failures.push(input);
      },
    },
    intake: {
      ingest: async () => {
        throw new Error("GMAIL_TEMPORARY");
      },
      refreshDuplicateReview: async () => undefined,
    },
  });
  assertEquals((failures[0] as { retryAt: Date | null }).retryAt, null);
});

Deno.test("terminal worker failure is not reclaimed after the lease is released", async () => {
  const store = createInMemoryBackgroundJobStore();
  const jobId = await store.enqueue({
    organizationId: "11111111-1111-4111-8111-111111111111",
    kind: "gmail_ingest",
    opaquePayload: { gmailMessageId: "message_1" },
    idempotencyKey: "delivery-1",
  });
  const [job] = await store.claim({
    workerId: "worker-a",
    now: new Date("2026-08-22T00:00:00.000Z"),
    leaseMs: 60_000,
    limit: 1,
  });
  await store.fail({
    jobId,
    leaseToken: job.leaseToken,
    errorCode: "PERMANENT_FAILURE",
    retryAt: null,
  });
  assertEquals(
    await store.claim({
      workerId: "worker-b",
      now: new Date("2026-08-22T00:02:00.000Z"),
      leaseMs: 60_000,
      limit: 1,
    }),
    [],
  );
});

Deno.test("worker executes duplicate review refresh jobs through the intake service", async () => {
  const refreshed: string[] = [];
  const completed: string[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-22T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-refresh",
        organizationId: "org-1",
        kind: "duplicate_review_refresh",
        opaquePayload: { caseId: "case-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-22T00:05:00.000Z",
      }],
      complete: async (input) => {
        completed.push(input.jobId);
      },
      fail: async () => {
        throw new Error("unexpected refresh failure");
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "unused",
        eventId: "unused",
      }),
      refreshDuplicateReview: async (input) => {
        refreshed.push(`${input.organizationId}:${input.caseId}`);
      },
    },
  });
  assertEquals(refreshed, ["org-1:case-1"]);
  assertEquals(completed, ["job-refresh"]);
});

Deno.test("worker routes document extraction and retries only its temporary provider failures", async () => {
  const extracted: string[] = [];
  const failures: Array<{ errorCode: string; retryAt: Date | null }> = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-22T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-extract",
        organizationId: "org-1",
        kind: "document_extract",
        opaquePayload: { documentVersionId: "document-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-22T00:05:00.000Z",
      }],
      complete: async () => {
        throw new Error("unexpected completion");
      },
      fail: async (input) => {
        failures.push({ errorCode: input.errorCode, retryAt: input.retryAt });
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "unused",
        eventId: "unused",
      }),
      refreshDuplicateReview: async () => undefined,
    },
    extraction: {
      extract: async (input) => {
        extracted.push(`${input.organizationId}:${input.documentVersionId}`);
        throw new Error("AZURE_TEMPORARY");
      },
    },
  });
  assertEquals(extracted, ["org-1:document-1"]);
  assertEquals(failures[0].errorCode, "AZURE_TEMPORARY");
  assertEquals(failures[0].retryAt?.toISOString(), "2026-08-22T00:00:05.000Z");
});

Deno.test("worker routes an adaptive request manifest without outbound effects", async () => {
  const analyzed: unknown[] = [];
  const completed: string[] = [];
  let outboundCalls = 0;
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-manifest",
        organizationId: "org-1",
        kind: "request_manifest",
        opaquePayload: { caseId: "case-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-09-01T12:05:00.000Z",
      }],
      complete: async ({ jobId }) => {
        completed.push(jobId);
      },
      fail: async () => {
        throw new Error("unexpected manifest failure");
      },
    },
    intake: {
      ingest: async () => {
        throw new Error("manifest must not enter Gmail intake");
      },
      refreshDuplicateReview: async () => undefined,
    },
    requestManifests: {
      analyze: async (input) => {
        analyzed.push(input);
        return { status: "review_required", externalEffects: false };
      },
    },
    outboundSends: {
      execute: async () => {
        outboundCalls += 1;
      },
    },
  });
  assertEquals(analyzed, [{
    organizationId: "org-1",
    caseId: "case-1",
    correlationId: "job-manifest",
  }]);
  assertEquals(completed, ["job-manifest"]);
  assertEquals(outboundCalls, 0);
});

Deno.test("worker promotes attachments only after a created or exact-attached Gmail intake", async () => {
  const promoted: string[] = [];
  const completed: string[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-intake-promote",
        organizationId: "org-1",
        kind: "gmail_ingest",
        opaquePayload: {
          gmailMessageId: "message_1",
          deliveryIdempotencyKey: "delivery_1",
        },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-27T00:05:00.000Z",
      }],
      complete: async (input) => {
        completed.push(input.jobId);
      },
      fail: async () => {
        throw new Error("unexpected failure");
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "case-1",
        eventId: "event-1",
      }),
      refreshDuplicateReview: async () => undefined,
    },
    attachmentPromotions: {
      promoteCase: async (input) => {
        promoted.push(
          `${input.organizationId}:${input.caseId}:${input.correlationId}`,
        );
        return [];
      },
    },
  });
  assertEquals(promoted, ["org-1:case-1:job-intake-promote"]);
  assertEquals(completed, ["job-intake-promote"]);
});

Deno.test("worker routes form mapping to a no-effects preparation service", async () => {
  const prepared: unknown[] = [];
  const completed: string[] = [];
  let outboundCalls = 0;
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-mapping",
        organizationId: "org-1",
        kind: "form_ai_mapping",
        opaquePayload: {
          caseId: "case-1",
          extractionId: "extraction-1",
          templateVersionId: "template-1",
        },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-27T00:05:00.000Z",
      }],
      complete: async (input) => {
        completed.push(input.jobId);
      },
      fail: async () => {
        throw new Error("unexpected mapping failure");
      },
    },
    intake: {
      ingest: async () => {
        throw new Error("mapping must not enter Gmail intake");
      },
      refreshDuplicateReview: async () => undefined,
    },
    formMappings: {
      prepare: async (input) => {
        prepared.push(input);
        return {
          status: "ready_for_operations_review",
          values: {},
          fields: [],
          externalEffects: false,
        };
      },
    },
    outboundSends: {
      execute: async () => {
        outboundCalls += 1;
      },
    },
  });
  assertEquals(prepared, [{
    organizationId: "org-1",
    caseId: "case-1",
    extractionId: "extraction-1",
    templateVersionId: "template-1",
    correlationId: "job-mapping",
  }]);
  assertEquals(completed, ["job-mapping"]);
  assertEquals(outboundCalls, 0);
});

Deno.test("worker routes supplier package generation without invoking outbound effects", async () => {
  const generated: unknown[] = [];
  const completed: string[] = [];
  let outboundCalls = 0;
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-29T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-package",
        organizationId: "org-1",
        kind: "generate_supplier_package",
        opaquePayload: { caseId: "case-1", snapshotId: "snapshot-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-29T00:05:00.000Z",
      }],
      complete: async (input) => {
        completed.push(input.jobId);
      },
      fail: async () => {
        throw new Error("unexpected package failure");
      },
    },
    intake: {
      ingest: async () => {
        throw new Error("package generation must not enter Gmail intake");
      },
      refreshDuplicateReview: async () => undefined,
    },
    supplierPackages: {
      generate: async (input) => {
        generated.push(input);
      },
    },
    outboundSends: {
      execute: async () => {
        outboundCalls += 1;
      },
    },
  });
  assertEquals(generated, [{
    organizationId: "org-1",
    caseId: "case-1",
    snapshotId: "snapshot-1",
    jobId: "job-package",
    leaseToken: "11111111-1111-4111-8111-111111111111",
  }]);
  assertEquals(completed, ["job-package"]);
  assertEquals(outboundCalls, 0);
});

Deno.test("worker rejects incomplete form mapping payloads without calling preparation or outbound", async () => {
  const failures: unknown[] = [];
  let preparationCalls = 0;
  let outboundCalls = 0;
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-mapping-invalid",
        organizationId: "org-1",
        kind: "form_ai_mapping",
        opaquePayload: { caseId: "case-1", extractionId: "extraction-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-27T00:05:00.000Z",
      }],
      complete: async () => {
        throw new Error("invalid mapping must not complete");
      },
      fail: async (input) => {
        failures.push(input);
      },
    },
    intake: {
      ingest: async () => {
        throw new Error("unexpected intake");
      },
      refreshDuplicateReview: async () => undefined,
    },
    formMappings: {
      prepare: async () => {
        preparationCalls += 1;
        return {
          status: "ready_for_operations_review",
          values: {},
          fields: [],
          externalEffects: false,
        };
      },
    },
    outboundSends: {
      execute: async () => {
        outboundCalls += 1;
      },
    },
  });
  assertEquals(preparationCalls, 0);
  assertEquals(outboundCalls, 0);
  assertEquals(
    (failures[0] as { errorCode: string }).errorCode,
    "INVALID_INPUT",
  );
  assertEquals((failures[0] as { retryAt: Date | null }).retryAt, null);
});

Deno.test("worker executes quarterly checks using server time without any send capability", async () => {
  const checks: string[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-24T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-quarterly",
        organizationId: "org-1",
        kind: "quarterly_document_check",
        opaquePayload: { scheduleRunId: "run-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-24T00:05:00.000Z",
      }],
      complete: async () => undefined,
      fail: async () => {
        throw new Error("unexpected quarterly failure");
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "unused",
        eventId: "unused",
      }),
      refreshDuplicateReview: async () => undefined,
    },
    quarterlyDocuments: {
      check: async (input) => {
        checks.push(
          `${input.organizationId}:${input.referenceDate.toISOString()}:${input.correlationId}`,
        );
      },
    },
  });
  assertEquals(checks, ["org-1:2026-08-24T00:00:00.000Z:job-quarterly"]);
});

Deno.test("worker routes apply_signature by opaque approval ID only", async () => {
  const applied: string[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-24T00:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "job-signature",
        organizationId: "org-1",
        kind: "apply_signature",
        opaquePayload: { approvalId: "approval-1", caseId: "case-1" },
        attempt: 1,
        leaseToken: "11111111-1111-4111-8111-111111111111",
        leasedUntil: "2026-08-24T00:05:00.000Z",
      }],
      complete: async () => undefined,
      fail: async () => {
        throw new Error("unexpected signature failure");
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "unused",
        eventId: "unused",
      }),
      refreshDuplicateReview: async () => undefined,
    },
    signatures: {
      apply: async (input) => {
        applied.push(
          `${input.organizationId}:${input.approvalId}:${input.jobId}:${input.leaseToken}`,
        );
        return {
          inputSha256: "a".repeat(64),
          outputSha256: "b".repeat(64),
          outputObjectId: "signed-output",
        };
      },
    },
  });
  assertEquals(applied, [
    "org-1:approval-1:job-signature:11111111-1111-4111-8111-111111111111",
  ]);
});

for (
  const databaseError of [
    { code: "40P01", message: "deadlock detected" },
    { code: "40001", message: "serialization failure" },
  ]
) {
  Deno.test(`worker retries PostgreSQL ${databaseError.code} as a temporary database failure`, async () => {
    const failures: unknown[] = [];
    const jobId = `job-signature-${databaseError.code.toLowerCase()}`;
    await runWorker({
      workerId: "local-worker",
      now: () => new Date("2026-08-24T00:00:00.000Z"),
      jobs: {
        claim: () =>
          Promise.resolve([{
            id: jobId,
            organizationId: "org-1",
            kind: "apply_signature",
            opaquePayload: { approvalId: "approval-1", caseId: "case-1" },
            attempt: 1,
            leaseToken: "11111111-1111-4111-8111-111111111111",
            leasedUntil: "2026-08-24T00:05:00.000Z",
          }]),
        complete: () => Promise.resolve(),
        fail: (input) => {
          failures.push(input);
          return Promise.resolve();
        },
      },
      intake: {
        ingest: () =>
          Promise.resolve({
            outcome: "created",
            caseId: "unused",
            eventId: "unused",
          }),
        refreshDuplicateReview: () => Promise.resolve(),
      },
      signatures: {
        apply: () =>
          Promise.reject(
            Object.assign(new Error(databaseError.message), {
              code: databaseError.code,
            }),
          ),
      },
    });
    assertEquals(failures, [{
      jobId,
      leaseToken: "11111111-1111-4111-8111-111111111111",
      errorCode: "DATABASE_TEMPORARY",
      retryAt: new Date("2026-08-24T00:00:05.000Z"),
    }]);
  });
}

Deno.test("worker routes an authorized send by opaque attempt and authorization IDs without automatic retry", async () => {
  const sent: unknown[] = [];
  const completed: string[] = [];
  await runWorker({
    workerId: "local-worker",
    now: () => new Date("2026-08-24T18:00:00.000Z"),
    jobs: {
      claim: async () => [{
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: "11111111-1111-4111-8111-111111111111",
        kind: "send_authorized_payload",
        opaquePayload: {
          attemptId: "66666666-6666-4666-8666-666666666666",
          authorizationId: "55555555-5555-4555-8555-555555555555",
        },
        attempt: 1,
        leaseToken: "88888888-8888-4888-8888-888888888888",
        leasedUntil: "2026-08-24T18:05:00.000Z",
      }],
      complete: async (input) => {
        completed.push(input.jobId);
      },
      fail: async () => {
        throw new Error("send outcomes must not use generic retry");
      },
    },
    intake: {
      ingest: async () => ({
        outcome: "created",
        caseId: "unused",
        eventId: "unused",
      }),
      refreshDuplicateReview: async () => undefined,
    },
    outboundSends: {
      execute: async (input) => {
        sent.push(input);
        return { outcome: "manual_reconciliation_required" };
      },
    },
  });
  assertEquals(sent, [{
    organizationId: "11111111-1111-4111-8111-111111111111",
    authorizationId: "55555555-5555-4555-8555-555555555555",
    attemptId: "66666666-6666-4666-8666-666666666666",
    jobId: "77777777-7777-4777-8777-777777777777",
    leaseToken: "88888888-8888-4888-8888-888888888888",
  }]);
  assertEquals(completed, ["77777777-7777-4777-8777-777777777777"]);
});
