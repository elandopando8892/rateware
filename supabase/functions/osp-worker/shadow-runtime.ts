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
  fetch?: typeof globalThis.fetch;
}): {
  enqueue(limit: number): Promise<number>;
  run(limit: number): Promise<number>;
} {
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
  const automationStorage = input.automation
    ? governedStorage(input.storageClient)
    : undefined;
  const attachmentPromotions = input.automation
    ? createAttachmentPromotionService({
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
    })
    : undefined;
  const extraction = input.automation
    ? createManagedExtractionService({
      store: createPostgresManagedExtractionStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
      storage: createSupabaseManagedExtractionStorage({
        client: automationStorage!,
      }),
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
      jobs,
    })
    : undefined;
  const formMappings = input.automation
    ? createAutomaticPreparationService(
      createPostgresAutomaticPreparationStore({
        databaseUrl: input.databaseUrl,
        postgresFactory: input.postgresFactory,
      }),
    )
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
        extraction,
        formMappings,
        limit,
      }),
  });
}
