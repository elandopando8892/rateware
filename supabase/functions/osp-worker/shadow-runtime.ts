import { createPostgresBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import { createGmailApiInboundPort } from "./gmail-api-inbound-port.ts";
import { createIntakeService } from "./intake-service.ts";
import {
  createPostgresIntakePersistence,
  type PostgresIntakePersistenceOptions,
} from "./postgres-intake-persistence.ts";
import { createRatewareGmailBridge } from "./rateware-gmail-bridge.ts";
import { createSupabaseOriginalObjectStore } from "./supabase-original-object-store.ts";
import { runWorker } from "./worker.ts";
import { createManagedMalwareScanner } from "../osp-document-api/managed-malware-scanner.ts";
import { createAttachmentPromotionService } from "./attachment-promotion.ts";
import { createPostgresAttachmentPromotionStore } from "./postgres-attachment-promotion-store.ts";
import { createSupabaseAttachmentPromotionStorage } from "./supabase-attachment-promotion-storage.ts";
import { createAzureDocumentIntelligence } from "./azure-document-intelligence.ts";
import { createOpenAiStructuredExtraction } from "./openai-structured-extraction.ts";
import { createOpenAiRequestManifest } from "./openai-request-manifest.ts";
import { createManagedExtractionService } from "./managed-extraction.ts";
import { createPostgresManagedExtractionStore } from "./postgres-managed-extraction-store.ts";
import { createSupabaseManagedExtractionStorage } from "./supabase-managed-extraction-storage.ts";
import { createAutomaticPreparationService } from "./automatic-preparation.ts";
import { createPostgresAutomaticPreparationStore } from "./postgres-automatic-preparation.ts";
import type { SupabaseClient } from "supabase";
import type { GovernedAutomationConfiguration } from "./governed-automation-config.ts";
import type { XlsxShadowConfiguration } from "./xlsx-shadow-config.ts";
import {
  createMacroSafeXlsmPackageScanner,
  createStrictXlsxPackageScanner,
} from "./strict-xlsx-package-scanner.ts";
import type { AttachmentPromotionService } from "./attachment-promotion.ts";
import type { ManagedExtractionService } from "./worker.ts";
import type { AutomaticPreparationService } from "./automatic-preparation.ts";
import type { OspXlsxIntakeConfiguration } from "./osp-xlsx-intake-config.ts";
import type { SupplierPackageCanaryConfiguration } from "./supplier-package-canary-config.ts";
import type { SignatureCanaryConfiguration } from "./signature-canary-config.ts";
import { createSupplierPackageJobService } from "./supplier-package-runtime.ts";
import {
  createSignatureJobService,
  type SignatureVaultReader,
} from "./signature-runtime.ts";
import { createGmailSendAdapter } from "../_shared/osp/gmail-send-adapter.ts";
import { createOutboundStoragePorts } from "../osp-case-api/outbound-draft.ts";
import { createPostgresOutboundSendStore } from "./outbound-receipt.ts";
import { runOutboundSendJob } from "./outbound-send-job.ts";
import type { RequestManifestShadowConfiguration } from "./request-manifest-shadow-config.ts";
import { createPostgresRequestManifestShadowSource } from "./postgres-request-manifest-shadow.ts";
import {
  createRequestManifestShadowService,
  type RequestManifestShadowRequest,
  type RequestManifestShadowResult,
} from "./request-manifest-shadow.ts";
import type { RequestManifestCanaryConfiguration } from "./request-manifest-canary-config.ts";
import { createPostgresRequestManifestSource } from "./postgres-request-manifest-source.ts";
import { createPostgresRequestManifestDraftStore } from "./postgres-request-manifest-draft-store.ts";
import {
  createRequestManifestCanaryService,
  type RequestManifestCanaryRequest,
} from "./request-manifest-canary.ts";
import type { AdaptiveManifestConfiguration } from "./adaptive-manifest-config.ts";
import { createRequestManifestJobService } from "./request-manifest-job.ts";
import { createStrictDocumentPackageScanner } from "./strict-document-package-scanner.ts";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12";
const PDF = "application/pdf";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type XlsxDocumentExtractCanary = {
  organizationId: string;
  caseId: string;
  jobId: string;
  documentVersionId: string;
  sourceSha256: string;
};

type SupplierPackageCanary = {
  organizationId: string;
  caseId: string;
  snapshotId: string;
  snapshotSha256: string;
};

type SignatureApplicationCanary = SignatureCanaryConfiguration;

function governedStorage(
  client: Parameters<typeof createSupabaseOriginalObjectStore>[0]["client"],
): Pick<SupabaseClient, "storage"> {
  if (!("storage" in client)) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return client;
}

export function createShadowWorkerRuntime(input: {
  databaseUrl: string;
  gmailAccessToken: () => Promise<string>;
  postgresFactory?: PostgresIntakePersistenceOptions["postgresFactory"];
  storageClient: Parameters<
    typeof createSupabaseOriginalObjectStore
  >[0]["client"];
  workerId: string;
  automation?: GovernedAutomationConfiguration;
  xlsxShadow?: XlsxShadowConfiguration;
  xlsxIntake?: OspXlsxIntakeConfiguration;
  supplierPackageCanary?: SupplierPackageCanaryConfiguration;
  signatureCanary?: SignatureCanaryConfiguration;
  requestManifestShadow?: RequestManifestShadowConfiguration;
  requestManifestCanary?: RequestManifestCanaryConfiguration;
  adaptiveManifest?: AdaptiveManifestConfiguration;
  signatureVault?: SignatureVaultReader;
  fetch?: typeof globalThis.fetch;
}): {
  enqueue(limit: number): Promise<number>;
  run(limit: number): Promise<number>;
  runXlsxDocumentExtractCanary?: (
    request: XlsxDocumentExtractCanary,
  ) => Promise<number>;
  runSupplierPackageCanary?: (
    request: SupplierPackageCanary,
  ) => Promise<number>;
  runSignatureApplicationCanary?: (
    request: SignatureApplicationCanary,
  ) => Promise<number>;
  runRequestManifestShadow?: (
    request: RequestManifestShadowRequest,
  ) => Promise<RequestManifestShadowResult>;
  runRequestManifestCanary?: (
    request: RequestManifestCanaryRequest,
  ) => Promise<unknown>;
} {
  if (
    [input.automation, input.xlsxShadow, input.xlsxIntake].filter(
      Boolean,
    ).length > 1
  ) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const jobs = createPostgresBackgroundJobStore({
    databaseUrl: input.databaseUrl,
    postgresFactory: input.postgresFactory,
  });
  const persistence = createPostgresIntakePersistence({
    databaseUrl: input.databaseUrl,
    postgresFactory: input.postgresFactory,
  });
  const intake = createIntakeService({
    gmail: createGmailApiInboundPort({ accessToken: input.gmailAccessToken }),
    objects: createSupabaseOriginalObjectStore({ client: input.storageClient }),
    persistence,
    jobs,
  });
  const bridge = createRatewareGmailBridge({
    databaseUrl: input.databaseUrl,
    postgresFactory: input.postgresFactory,
  });
  const request = input.fetch ?? globalThis.fetch;
  const requestManifest = input.requestManifestShadow
    ? createRequestManifestShadowService({
      configuration: input.requestManifestShadow,
      source: createPostgresRequestManifestShadowSource({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: {
        async download(bucketId, objectKey) {
          const result = await governedStorage(input.storageClient).storage
            .from(bucketId)
            .download(objectKey);
          if (result.error || !result.data) return null;
          return new Uint8Array(await result.data.arrayBuffer());
        },
      },
      interpreter: createOpenAiRequestManifest({
        baseUrl: "https://api.openai.com",
        apiKey: input.requestManifestShadow.openAiApiKey,
        model: input.requestManifestShadow.openAiModel,
        request,
      }),
    })
    : undefined;
  const requestManifestCanary = input.requestManifestCanary
    ? createRequestManifestCanaryService({
      configuration: input.requestManifestCanary,
      source: createPostgresRequestManifestSource({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: {
        async download(bucketId, objectKey) {
          const result = await governedStorage(input.storageClient).storage
            .from(bucketId)
            .download(objectKey);
          if (result.error || !result.data) return null;
          return new Uint8Array(await result.data.arrayBuffer());
        },
      },
      interpreter: createOpenAiRequestManifest({
        baseUrl: "https://api.openai.com",
        apiKey: input.requestManifestCanary.openAiApiKey,
        model: input.requestManifestCanary.openAiModel,
        request,
      }),
      store: createPostgresRequestManifestDraftStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
    })
    : undefined;
  const requestManifestJobs = input.adaptiveManifest
    ? createRequestManifestJobService({
      source: createPostgresRequestManifestSource({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: {
        async download(bucketId, objectKey) {
          const result = await governedStorage(input.storageClient).storage
            .from(bucketId)
            .download(objectKey);
          if (result.error || !result.data) return null;
          return new Uint8Array(await result.data.arrayBuffer());
        },
      },
      interpreter: createOpenAiRequestManifest({
        baseUrl: "https://api.openai.com",
        apiKey: input.adaptiveManifest.openAiApiKey,
        model: input.adaptiveManifest.openAiModel,
        request,
      }),
      store: createPostgresRequestManifestDraftStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
    })
    : undefined;
  let outboundStore:
    | ReturnType<typeof createPostgresOutboundSendStore>
    | undefined;
  const getOutboundStore = () =>
    outboundStore ??= createPostgresOutboundSendStore({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
    });
  let gmailSender:
    | Awaited<ReturnType<typeof createGmailSendAdapter>>
    | undefined;
  const outboundSends = Object.freeze({
    execute: async (
      job: {
        organizationId: string;
        authorizationId: string;
        attemptId: string;
        jobId: string;
        leaseToken: string;
      },
    ) => {
      gmailSender ??= await createGmailSendAdapter({
        accessToken: input.gmailAccessToken,
        fetch: request,
        mimeObjects: createOutboundStoragePorts(
          governedStorage(input.storageClient),
        ).objects,
      });
      return await runOutboundSendJob({
        organizationId: job.organizationId,
        attemptId: job.attemptId,
        jobId: job.jobId,
        leaseToken: job.leaseToken,
      }, {
        store: getOutboundStore(),
        gmail: gmailSender,
        signal: AbortSignal.timeout(30_000),
      });
    },
  });
  const automationStorage = input.automation || input.xlsxShadow ||
      input.xlsxIntake || input.adaptiveManifest
    ? governedStorage(input.storageClient)
    : undefined;
  let attachmentPromotions: AttachmentPromotionService | undefined;
  if (input.automation) {
    const managedScan = createManagedMalwareScanner({
      origin: input.automation.malwareScannerOrigin,
      token: input.automation.malwareScannerToken,
      fetch: request,
    });
    attachmentPromotions = createAttachmentPromotionService({
      store: createPostgresAttachmentPromotionStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: createSupabaseAttachmentPromotionStorage({
        client: automationStorage!,
      }),
      scan: async (
        { bytes, contentType, sourceUrl, sourceSha256, sizeBytes },
      ) => {
        const malwareResult = await managedScan({
          sourceUrl: await sourceUrl(),
          sourceSha256,
          sizeBytes,
        });
        if (malwareResult !== "clean" || contentType !== XLSM) {
          return malwareResult;
        }
        return await createMacroSafeXlsmPackageScanner()(bytes);
      },
      sourceSafetyReason: (source) =>
        source.contentType === XLSM
          ? "macro_quarantined_openxml_policy"
          : "managed_malware_scan_clean",
      jobs,
    });
  } else if (input.xlsxShadow) {
    const promoted = createAttachmentPromotionService({
      store: createPostgresAttachmentPromotionStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: createSupabaseAttachmentPromotionStorage({
        client: automationStorage!,
      }),
      scan: ({ bytes }) =>
        createStrictXlsxPackageScanner(input.xlsxShadow!.sourceSha256)(bytes),
      sourceSafetyReason: "strict_xlsx_package_policy",
      jobs,
    });
    attachmentPromotions = Object.freeze({
      promoteCase: (
        request: Parameters<AttachmentPromotionService["promoteCase"]>[0],
      ) =>
        request.organizationId === input.xlsxShadow!.organizationId &&
          request.caseId === input.xlsxShadow!.caseId
          ? promoted.promoteCase(request)
          : Promise.resolve(Object.freeze([])),
    });
  } else if (input.xlsxIntake) {
    attachmentPromotions = createAttachmentPromotionService({
      store: createPostgresAttachmentPromotionStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: createSupabaseAttachmentPromotionStorage({
        client: automationStorage!,
      }),
      scan: ({ bytes, contentType }) =>
        contentType === XLSM
          ? createMacroSafeXlsmPackageScanner()(bytes)
          : contentType === XLSX
          ? createStrictXlsxPackageScanner()(bytes)
          : createStrictDocumentPackageScanner(contentType)(bytes),
      sourceSafetyReason: (source) =>
        source.contentType === XLSM
          ? "macro_quarantined_openxml_policy"
          : source.contentType === XLSX
          ? "strict_xlsx_package_policy"
          : "strict_passive_document_policy",
      contentTypes: input.adaptiveManifest
        ? [XLSX, XLSM, PDF, DOCX]
        : [XLSX, XLSM],
      jobs,
    });
  }
  let extraction: ManagedExtractionService | undefined;
  if (input.automation || input.xlsxShadow || input.xlsxIntake) {
    const managedStore = createPostgresManagedExtractionStore({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
    });
    const extractionStore = input.xlsxShadow
      ? {
        async load(
          request: { organizationId: string; documentVersionId: string },
        ) {
          if (request.organizationId !== input.xlsxShadow!.organizationId) {
            throw new Error("INVALID_INPUT");
          }
          const source = await managedStore.load(request);
          if (
            source.caseId !== input.xlsxShadow!.caseId ||
            source.sourceSha256 !== input.xlsxShadow!.sourceSha256 ||
            source.contentType !== XLSX
          ) throw new Error("INVALID_INPUT");
          return source;
        },
        persist: managedStore.persist,
      }
      : managedStore;
    const managedStorage = createSupabaseManagedExtractionStorage({
      client: automationStorage!,
    });
    extraction = createManagedExtractionService({
      store: extractionStore,
      storage: managedStorage,
      ...(input.automation
        ? {
          layout: createAzureDocumentIntelligence({
            endpoint: input.automation.azureDocumentEndpoint,
            apiKey: input.automation.azureDocumentApiKey,
            request,
          }),
          structured: {
            modelVersion: input.automation.openAiModel,
            extract: createOpenAiStructuredExtraction({
              baseUrl: "https://api.openai.com",
              apiKey: input.automation.openAiApiKey,
              model: input.automation.openAiModel,
              request,
            }).extract,
          },
        }
        : {}),
      jobs,
    });
  }
  let formMappings: AutomaticPreparationService | undefined;
  if (input.automation || input.xlsxShadow || input.xlsxIntake) {
    const prepared = createAutomaticPreparationService(
      createPostgresAutomaticPreparationStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
    );
    formMappings = input.xlsxShadow
      ? Object.freeze({
        prepare: (
          request: Parameters<AutomaticPreparationService["prepare"]>[0],
        ) => {
          if (
            request.organizationId !== input.xlsxShadow!.organizationId ||
            request.caseId !== input.xlsxShadow!.caseId
          ) throw new Error("INVALID_INPUT");
          return prepared.prepare(request);
        },
      })
      : prepared;
  }
  const runXlsxDocumentExtractCanary = input.xlsxShadow && extraction
    ? async (request: XlsxDocumentExtractCanary): Promise<number> => {
      if (
        request.organizationId !== input.xlsxShadow!.organizationId ||
        request.caseId !== input.xlsxShadow!.caseId ||
        request.sourceSha256 !== input.xlsxShadow!.sourceSha256
      ) throw new Error("INVALID_INPUT");
      return await runWorker({
        workerId: input.workerId,
        now: () => new Date(),
        jobs: {
          claim: ({ leaseMs }) =>
            jobs.claimShadowDocumentExtract({
              ...request,
              leaseMs,
            }),
          complete: jobs.complete,
          fail: jobs.fail,
        },
        intake,
        extraction,
        limit: 1,
      });
    }
    : undefined;
  const supplierPackages = input.supplierPackageCanary
    ? createSupplierPackageJobService({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
      storageClient: governedStorage(input.storageClient),
    })
    : undefined;
  const signatures = input.signatureVault
    ? createSignatureJobService({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
      storageClient: governedStorage(input.storageClient),
      vault: input.signatureVault,
    })
    : undefined;
  const runSupplierPackageCanary = input.supplierPackageCanary &&
      supplierPackages
    ? async (request: SupplierPackageCanary): Promise<number> => {
      const allowed = input.supplierPackageCanary!;
      if (
        request.organizationId !== allowed.organizationId ||
        request.caseId !== allowed.caseId ||
        request.snapshotId !== allowed.snapshotId ||
        request.snapshotSha256 !== allowed.snapshotSha256
      ) throw new Error("INVALID_INPUT");
      const jobId = await jobs.enqueue({
        organizationId: request.organizationId,
        kind: "generate_supplier_package",
        opaquePayload: {
          caseId: request.caseId,
          snapshotId: request.snapshotId,
        },
        idempotencyKey: `supplier-package:${request.snapshotId}`,
      });
      return await runWorker({
        workerId: input.workerId,
        now: () => new Date(),
        jobs: {
          claim: ({ leaseMs }) =>
            jobs.claimSupplierPackageCanary({
              ...request,
              jobId,
              leaseMs,
            }),
          complete: jobs.complete,
          fail: jobs.fail,
        },
        intake,
        supplierPackages,
        limit: 1,
      });
    }
    : undefined;
  const runSignatureApplicationCanary = input.signatureCanary && signatures
    ? async (request: SignatureApplicationCanary): Promise<number> => {
      const allowed = input.signatureCanary!;
      if (
        request.organizationId !== allowed.organizationId ||
        request.caseId !== allowed.caseId || request.jobId !== allowed.jobId ||
        request.approvalId !== allowed.approvalId ||
        request.expectedCaseVersion !== allowed.expectedCaseVersion ||
        request.inputSnapshotSha256 !== allowed.inputSnapshotSha256 ||
        request.inputPackageSha256 !== allowed.inputPackageSha256 ||
        request.signaturePositionVersion !== allowed.signaturePositionVersion
      ) throw new Error("INVALID_INPUT");
      return await runWorker({
        workerId: input.workerId,
        now: () => new Date(),
        jobs: {
          claim: ({ leaseMs }) =>
            jobs.claimSignatureApplicationCanary({
              ...request,
              leaseMs,
            }),
          complete: jobs.complete,
          fail: jobs.fail,
        },
        intake,
        signatures,
        limit: 1,
      });
    }
    : undefined;
  return Object.freeze({
    enqueue: (limit: number) => bridge.enqueue(limit),
    run: (limit: number) =>
      runWorker({
        workerId: input.workerId,
        now: () => new Date(),
        jobs,
        intake,
        attachmentPromotions,
        requestManifests: requestManifestJobs,
        extraction,
        formMappings,
        signatures,
        outboundSends,
        limit,
      }),
    runXlsxDocumentExtractCanary,
    runSupplierPackageCanary,
    runSignatureApplicationCanary,
    runRequestManifestShadow: requestManifest
      ? (request: RequestManifestShadowRequest) => requestManifest.run(request)
      : undefined,
    runRequestManifestCanary: requestManifestCanary
      ? (request: RequestManifestCanaryRequest) =>
        requestManifestCanary.run(request)
      : undefined,
  });
}
