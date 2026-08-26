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

export function createShadowWorkerRuntime(input: {
  databaseUrl: string;
  gmailAccessToken: () => Promise<string>;
  postgresFactory?: PostgresIntakePersistenceOptions["postgresFactory"];
  storageClient: Parameters<
    typeof createSupabaseOriginalObjectStore
  >[0]["client"];
  workerId: string;
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
  return Object.freeze({
    enqueue: (limit: number) => bridge.enqueue(limit),
    run: (limit: number) =>
      runWorker({
        workerId: input.workerId,
        now: () => new Date(),
        jobs,
        intake,
        limit,
      }),
  });
}
