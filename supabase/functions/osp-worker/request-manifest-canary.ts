import type { RequestManifestTelemetry } from "./openai-request-manifest.ts";
import type { RequestManifestCanaryConfiguration } from "./request-manifest-canary-config.ts";
import {
  createRequestManifestDraftService,
  type RequestManifestDraftStore,
  type RequestManifestSource,
} from "./request-manifest-draft.ts";
import type { RequestManifestSourceReference } from "./postgres-request-manifest-source.ts";

export type RequestManifestCanaryRequest = Readonly<{
  organizationId: string;
  caseId: string;
}>;

type SourcePort = Readonly<{
  load(
    input: RequestManifestCanaryRequest,
  ): Promise<RequestManifestSourceReference>;
}>;
type StoragePort = Readonly<{
  download(bucketId: string, objectKey: string): Promise<Uint8Array | null>;
}>;
type InterpreterPort = Parameters<
  typeof createRequestManifestDraftService
>[0]["interpreter"];

function exact(
  configuration: RequestManifestCanaryConfiguration,
  request: RequestManifestCanaryRequest,
): boolean {
  return configuration.organizationId === request.organizationId &&
    configuration.caseId === request.caseId;
}

export function createRequestManifestCanaryService(options: {
  configuration: RequestManifestCanaryConfiguration;
  source: SourcePort;
  storage: StoragePort;
  interpreter: InterpreterPort;
  store: RequestManifestDraftStore;
  clock?: () => Date;
}) {
  const draft = createRequestManifestDraftService({
    interpreter: options.interpreter,
    store: options.store,
    clock: options.clock,
  });
  let consumed = false;
  return Object.freeze({
    async run(request: RequestManifestCanaryRequest) {
      if (!exact(options.configuration, request) || consumed) {
        throw new Error("CANARY_NOT_ALLOWED");
      }
      consumed = true;
      const reference = await options.source.load(request);
      let totalBytes = 0;
      const documents: RequestManifestSource["documents"][number][] = [];
      for (const document of reference.documents) {
        const bytes = await options.storage.download(
          document.bucketId,
          document.objectKey,
        );
        if (!bytes) throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
        totalBytes += bytes.byteLength;
        if (
          bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024 ||
          totalBytes > 20 * 1024 * 1024
        ) {
          throw new Error("REQUEST_MANIFEST_ATTACHMENT_LIMIT");
        }
        documents.push(Object.freeze({
          versionId: document.versionId,
          sourceName: document.sourceName,
          contentType: document.contentType,
          sourceSha256: document.sourceSha256,
          sourceSafety: document.sourceSafety,
          bytes: Uint8Array.from(bytes),
        }));
      }
      const result = await draft.run(Object.freeze({
        organizationId: reference.organizationId,
        caseId: reference.caseId,
        message: reference.message,
        documents: Object.freeze(documents),
        knowledgeCatalog: reference.knowledgeCatalog,
      }));
      const telemetry: RequestManifestTelemetry = result.telemetry;
      return Object.freeze({
        receipt: result.receipt,
        evidenceSha256: result.evidenceSha256,
        sourceCount: result.manifest.sourceCount,
        sourceCoverage: result.manifest.sourceCoverage,
        readiness: result.manifest.readiness,
        telemetry: Object.freeze({
          model: telemetry.model,
          responseId: telemetry.responseId,
          inputTokens: telemetry.inputTokens,
          outputTokens: telemetry.outputTokens,
          totalTokens: telemetry.totalTokens,
          durationMs: telemetry.durationMs,
        }),
        status: "review_required" as const,
        externalEffects: false as const,
      });
    },
  });
}
