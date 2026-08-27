import { createPostgresBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import { createGmailApiInboundPort } from "./gmail-api-inbound-port.ts";
import {
  createIntakeService,
  type IntakePersistence,
} from "./intake-service.ts";
import {
  createPostgresIntakePersistence,
  type PostgresIntakePersistenceOptions,
} from "./postgres-intake-persistence.ts";
import { createPostgresQuarterlyDocumentService } from "./postgres-quarterly-document-service.ts";
import { createSupabaseOriginalObjectStore } from "./supabase-original-object-store.ts";
import { type QuarterlyDocumentService, runWorker } from "./worker.ts";
import type { AutomaticPreparationService } from "./automatic-preparation.ts";
import {
  createSignatureJobService,
  type SignatureVaultReader,
} from "./signature-runtime.ts";
import { createGmailSendAdapter } from "../_shared/osp/gmail-send-adapter.ts";
import { createOutboundStoragePorts } from "../osp-case-api/outbound-draft.ts";
import type { OutboundStorageClient } from "../osp-case-api/outbound-draft.ts";
import {
  captureInboundGmailEvent,
  createPostgresOutboundSendStore,
} from "./outbound-receipt.ts";
import { runOutboundSendJob } from "./outbound-send-job.ts";

export type WorkerComposition = {
  databaseUrl: string;
  gmailAccessToken: () => Promise<string>;
  gmailFetch?: typeof globalThis.fetch;
  outboundStorageClient?: OutboundStorageClient;
  persistence?: IntakePersistence;
  postgresFactory?: PostgresIntakePersistenceOptions["postgresFactory"];
  quarterlyDocuments?: QuarterlyDocumentService;
  formMappings?: AutomaticPreparationService;
  signatureVault?: SignatureVaultReader;
  storageClient: Parameters<
    typeof createSupabaseOriginalObjectStore
  >[0]["client"];
  workerId: string;
};

export async function runComposedWorker(
  input: WorkerComposition,
): Promise<number> {
  const jobs = createPostgresBackgroundJobStore({
    databaseUrl: input.databaseUrl,
    postgresFactory: input.postgresFactory,
  });
  const persistence = input.persistence ??
    createPostgresIntakePersistence({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
    });
  const quarterlyDocuments = input.quarterlyDocuments ??
    createPostgresQuarterlyDocumentService({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
    });
  let outboundStore:
    | ReturnType<typeof createPostgresOutboundSendStore>
    | undefined;
  const getOutboundStore = () =>
    outboundStore ??= createPostgresOutboundSendStore({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
    });
  const intake = createIntakeService({
    gmail: createGmailApiInboundPort({ accessToken: input.gmailAccessToken }),
    objects: createSupabaseOriginalObjectStore({ client: input.storageClient }),
    persistence,
    jobs,
    receipts: {
      capture: (event) =>
        captureInboundGmailEvent(event, { store: getOutboundStore() }),
    },
  });
  const signatures = input.signatureVault
    ? createSignatureJobService({
      databaseUrl: input.databaseUrl,
      postgresFactory: input.postgresFactory,
      storageClient: input.storageClient,
      vault: input.signatureVault,
    })
    : undefined;
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
      const outboundStorage = input.outboundStorageClient ??
        ("storage" in input.storageClient ? input.storageClient : undefined);
      if (!outboundStorage) throw new Error("INVALID_RUNTIME_CONFIGURATION");
      gmailSender ??= await createGmailSendAdapter({
        accessToken: input.gmailAccessToken,
        fetch: input.gmailFetch ?? globalThis.fetch,
        mimeObjects: createOutboundStoragePorts(outboundStorage).objects,
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
  return await runWorker({
    workerId: input.workerId,
    now: () => new Date(),
    jobs,
    intake,
    formMappings: input.formMappings,
    quarterlyDocuments,
    signatures,
    outboundSends,
  });
}
