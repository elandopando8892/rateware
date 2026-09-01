import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createAttachmentPromotionService } from "./attachment-promotion.ts";
import { createInMemoryBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const bytes = new TextEncoder().encode("synthetic supplier requirement");

Deno.test("attachment promotion verifies, scans, registers and queues one deterministic extraction", async () => {
  const sourceSha256 = await sha256Hex(bytes);
  const stored: unknown[] = [];
  const scans: unknown[] = [];
  const jobs = createInMemoryBackgroundJobStore();
  const service = createAttachmentPromotionService({
    store: {
      listCaseAttachments: async () => [{
        id: attachmentId,
        organizationId,
        caseId,
        sourceObjectKey:
          `${organizationId}/44444444-4444-4444-8444-444444444444`,
        sourceSha256,
        contentType: "application/pdf",
      }],
      register: async (input) => {
        stored.push(input);
        return { documentVersionId: attachmentId, templateVersionId: null };
      },
    },
    storage: {
      downloadOriginal: async () => bytes,
      createOriginalReadUrl: async () =>
        "https://storage.example.test/signed-source?token=synthetic",
      putCorporate: async (input) => {
        stored.push(input);
      },
    },
    scan: async (input) => {
      scans.push({
        ...input,
        sourceUrl: await input.sourceUrl(),
      });
      return "clean";
    },
    jobs,
  });
  assertEquals(
    await service.promoteCase({
      organizationId,
      caseId,
      correlationId: "job-1",
    }),
    [{ documentVersionId: attachmentId, templateVersionId: null }],
  );
  assertEquals(scans, [{
    bytes,
    sourceUrl: "https://storage.example.test/signed-source?token=synthetic",
    sourceSha256,
    sizeBytes: bytes.byteLength,
  }]);
  assertEquals(
    (stored[0] as { objectKey: string }).objectKey,
    `${organizationId}/${attachmentId}`,
  );
  assertEquals(
    (stored[1] as { sourceSafetyReason: string }).sourceSafetyReason,
    "managed_malware_scan_clean",
  );
  const [job] = await jobs.claim({
    workerId: "test",
    now: new Date(),
    leaseMs: 60_000,
    limit: 1,
  });
  assertEquals(job.kind, "document_extract");
  assertEquals(job.opaquePayload, { documentVersionId: attachmentId });
});

Deno.test("attachment promotion fails closed before persistence on hash or malware mismatch", async () => {
  const source = {
    id: attachmentId,
    organizationId,
    caseId,
    sourceObjectKey: `${organizationId}/44444444-4444-4444-8444-444444444444`,
    sourceSha256: "0".repeat(64),
    contentType: "application/pdf",
  } as const;
  let registered = 0;
  const dependencies = (scan: () => Promise<"clean" | "infected">) => ({
    store: {
      listCaseAttachments: async () => [source],
      register: async () => {
        registered += 1;
        return { documentVersionId: attachmentId, templateVersionId: null };
      },
    },
    storage: {
      downloadOriginal: async () => bytes,
      createOriginalReadUrl: async () =>
        "https://storage.example.test/signed-source?token=synthetic",
      putCorporate: async () => undefined,
    },
    scan,
    jobs: createInMemoryBackgroundJobStore(),
  });
  await assertRejects(
    () =>
      createAttachmentPromotionService(dependencies(async () => "clean"))
        .promoteCase({ organizationId, caseId, correlationId: "job-1" }),
    Error,
    "SOURCE_HASH_MISMATCH",
  );

  const validSource = { ...source, sourceSha256: await sha256Hex(bytes) };
  await assertRejects(
    () =>
      createAttachmentPromotionService({
        ...dependencies(async () => "infected"),
        store: {
          ...dependencies(async () => "infected").store,
          listCaseAttachments: async () => [validSource],
        },
      }).promoteCase({ organizationId, caseId, correlationId: "job-2" }),
    Error,
    "MALWARE_SCAN_REJECTED",
  );
  assertEquals(registered, 0);
});

Deno.test("attachment promotion can limit a free deterministic route to XLSX", async () => {
  let downloaded = 0;
  const service = createAttachmentPromotionService({
    store: {
      listCaseAttachments: async () => [{
        id: attachmentId,
        organizationId,
        caseId,
        sourceObjectKey:
          `${organizationId}/44444444-4444-4444-8444-444444444444`,
        sourceSha256: await sha256Hex(bytes),
        contentType: "application/pdf",
      }],
      register: async () => {
        throw new Error("must not register excluded content");
      },
    },
    storage: {
      downloadOriginal: async () => {
        downloaded += 1;
        return bytes;
      },
      createOriginalReadUrl: async () =>
        "https://storage.example.test/signed-source?token=synthetic",
      putCorporate: async () => undefined,
    },
    scan: async () => "clean",
    contentTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    jobs: createInMemoryBackgroundJobStore(),
  });
  assertEquals(
    await service.promoteCase({
      organizationId,
      caseId,
      correlationId: "job-filter",
    }),
    [],
  );
  assertEquals(downloaded, 0);
});

Deno.test("DOCX promotion preserves safe evidence without queuing the legacy extractor", async () => {
  const sourceSha256 = await sha256Hex(bytes);
  const jobs = createInMemoryBackgroundJobStore();
  const service = createAttachmentPromotionService({
    store: {
      listCaseAttachments: async () => [{
        id: attachmentId,
        organizationId,
        caseId,
        sourceObjectKey: `${organizationId}/44444444-4444-4444-8444-444444444444`,
        sourceSha256,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }],
      register: async () => ({ documentVersionId: attachmentId, templateVersionId: null }),
    },
    storage: {
      downloadOriginal: async () => bytes,
      createOriginalReadUrl: async () => "https://storage.example.test/signed-source?token=synthetic",
      putCorporate: async () => undefined,
    },
    scan: async () => "clean",
    jobs,
  });
  assertEquals((await service.promoteCase({ organizationId, caseId, correlationId: "docx" })).length, 1);
  assertEquals(await jobs.claim({ workerId: "test", now: new Date(), leaseMs: 60_000, limit: 1 }), []);
});
