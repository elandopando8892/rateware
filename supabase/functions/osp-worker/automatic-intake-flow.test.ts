import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createInMemoryBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { createAttachmentPromotionService } from "./attachment-promotion.ts";
import { createAutomaticPreparationService } from "./automatic-preparation.ts";
import { createManagedExtractionService } from "./managed-extraction.ts";
import { runWorker } from "./worker.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const templateVersionId = "44444444-4444-4444-8444-444444444444";

Deno.test("copied Gmail request reaches a grounded no-effects Operations draft through queued jobs", async () => {
  const bytes = new TextEncoder().encode("Carrier ACME onboarding request");
  const sourceSha256 = await sha256Hex(bytes);
  const evidenceHash = await sha256Hex(
    new TextEncoder().encode("Carrier ACME"),
  );
  const jobs = createInMemoryBackgroundJobStore();
  let extraction:
    | {
      id: string;
      fields: readonly {
        id: string;
        fieldKey: string;
        value: unknown;
        confidence: number;
        validation: string;
      }[];
    }
    | undefined;
  const plans: unknown[] = [];
  const manifests: unknown[] = [];
  let outboundCalls = 0;

  const attachmentPromotions = createAttachmentPromotionService({
    store: {
      listCaseAttachments: async () => [{
        id: attachmentId,
        organizationId,
        caseId,
        sourceObjectKey:
          `${organizationId}/55555555-5555-4555-8555-555555555555`,
        sourceSha256,
        contentType: "application/pdf",
      }],
      register: async () => ({
        documentVersionId: attachmentId,
        templateVersionId,
      }),
    },
    storage: {
      downloadOriginal: async () => bytes,
      putCorporate: async () => undefined,
    },
    scan: async () => "clean",
    jobs,
  });
  const extractionService = createManagedExtractionService({
    store: {
      load: async () => ({
        organizationId,
        caseId,
        documentVersionId: attachmentId,
        bucketId: "osp-corporate-documents",
        objectKey: `${organizationId}/${attachmentId}`,
        contentType: "application/pdf",
        sourceSha256,
        sourceSafety: "safe",
        templateVersionId,
        existingExtractionId: null,
      }),
      persist: async ({ snapshot }) => {
        extraction = snapshot;
        return snapshot.id;
      },
    },
    storage: { download: async () => bytes },
    layout: {
      analyze: async () => ({
        modelVersion: "prebuilt-layout@2024-11-30",
        classifications: [],
        evidence: [{
          id: "pdf:p1:l1",
          locator: {
            kind: "pdf_region",
            sourceVersionId: attachmentId,
            page: 1,
            polygon: [0, 0, 1, 0, 1, 1, 0, 1],
            rawEvidenceHash: evidenceHash,
          },
          content: "Carrier ACME",
          contentSha256: evidenceHash,
        }],
      }),
    },
    structured: {
      modelVersion: "gpt-synthetic",
      extract: async () => ({
        schemaVersion: 1,
        supplier: {
          legalName: {
            presence: "present",
            value: "Carrier ACME",
            confidence: 0.99,
            evidenceIds: ["pdf:p1:l1"],
          },
        },
        requestedDocuments: [],
        requirements: [],
        contradictions: [],
        missingInformation: [],
        clarificationQuestions: [],
      }),
    },
    jobs,
  });
  const formMappings = createAutomaticPreparationService({
    load: async (input) => ({
      caseId: input.caseId,
      extractionId: input.extractionId,
      templateVersionId: input.templateVersionId,
      fields: [{
        fieldId: "supplier.legalName",
        canonicalFieldId: null,
        supplierAliases: [],
        required: true,
      }],
      candidates: extraction!.fields.map((field) => ({
        fieldKey: field.fieldKey,
        value: field.value,
        source: "attachment" as const,
        confidence: field.confidence,
        validation: field.validation as "valid",
        evidenceIds: [field.id],
      })),
      currentValues: {},
    }),
    persist: async (input) => {
      plans.push(input.plan);
    },
  });
  await jobs.enqueue({
    organizationId,
    kind: "gmail_ingest",
    opaquePayload: {
      gmailMessageId: "gmail_1",
      deliveryIdempotencyKey: "delivery_1",
    },
    idempotencyKey: "gmail_1",
  });
  const intake = {
    ingest: async () => ({
      outcome: "created" as const,
      caseId,
      eventId: "event-1",
    }),
    refreshDuplicateReview: async () => undefined,
  };
  for (let pass = 0; pass < 4; pass++) {
    await runWorker({
      workerId: "synthetic-flow",
      now: () => new Date(`2026-08-27T00:00:0${pass}.000Z`),
      jobs,
      intake,
      attachmentPromotions,
      extraction: extractionService,
      formMappings,
      requestManifests: {
        analyze: async (input) => {
          manifests.push(input);
          return { status: "review_required", externalEffects: false };
        },
      },
      outboundSends: {
        execute: async () => {
          outboundCalls += 1;
        },
      },
      limit: 1,
    });
  }
  assertEquals(plans, [{
    status: "ready_for_operations_review",
    values: { "supplier.legalName": "Carrier ACME" },
    fields: [{
      fieldId: "supplier.legalName",
      source: "attachment",
      status: "prepared",
      evidenceIds: [extraction!.fields[0].id],
    }],
    externalEffects: false,
  }]);
  assertEquals(manifests, [{
    organizationId,
    caseId,
    correlationId: manifests.length > 0
      ? (manifests[0] as { correlationId: string }).correlationId
      : "",
  }]);
  assertEquals(outboundCalls, 0);
});
