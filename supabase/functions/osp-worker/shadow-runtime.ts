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
import { createManagedExtractionService } from "./managed-extraction.ts";
import { createPostgresManagedExtractionStore } from "./postgres-managed-extraction-store.ts";
import { createSupabaseManagedExtractionStorage } from "./supabase-managed-extraction-storage.ts";
import { createAutomaticPreparationService } from "./automatic-preparation.ts";
import { createPostgresAutomaticPreparationStore } from "./postgres-automatic-preparation.ts";
import type { SupabaseClient } from "supabase";
import type { GovernedAutomationConfiguration } from "./governed-automation-config.ts";
import type { XlsxShadowConfiguration } from "./xlsx-shadow-config.ts";
import { createStrictXlsxPackageScanner } from "./strict-xlsx-package-scanner.ts";
import type { AttachmentPromotionService } from "./attachment-promotion.ts";
import type { ManagedExtractionService } from "./worker.ts";
import type { AutomaticPreparationService } from "./automatic-preparation.ts";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  fetch?: typeof globalThis.fetch;
}): {
  enqueue(limit: number): Promise<number>;
  run(limit: number): Promise<number>;
} {
  if (input.automation && input.xlsxShadow) {
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
  const automationStorage = input.automation || input.xlsxShadow
    ? governedStorage(input.storageClient)
    : undefined;
  let attachmentPromotions: AttachmentPromotionService | undefined;
  if (input.automation) {
    attachmentPromotions = createAttachmentPromotionService({
      store: createPostgresAttachmentPromotionStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: createSupabaseAttachmentPromotionStorage({
        client: automationStorage!,
      }),
      scan: createManagedMalwareScanner({
        origin: input.automation.malwareScannerOrigin,
        token: input.automation.malwareScannerToken,
        fetch: request,
      }),
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
      scan: createStrictXlsxPackageScanner(input.xlsxShadow.sourceSha256),
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
  }
  let extraction: ManagedExtractionService | undefined;
  if (input.automation || input.xlsxShadow) {
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
    extraction = createManagedExtractionService({
      store: extractionStore,
      storage: createSupabaseManagedExtractionStorage({
        client: automationStorage!,
      }),
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
  if (input.automation || input.xlsxShadow) {
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
  return Object.freeze({
    enqueue: (limit: number) => bridge.enqueue(limit),
    run: (limit: number) =>
      runWorker({
        workerId: input.workerId,
        now: () => new Date(),
        jobs,
        intake,
        attachmentPromotions,
        extraction,
        formMappings,
        limit,
      }),
  });
}
