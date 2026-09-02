import {
  createRequestManifestDraftService,
  type RequestManifestDraftStore,
  type RequestManifestSource,
} from "./request-manifest-draft.ts";
import type { RequestManifestSourceReference } from "./postgres-request-manifest-source.ts";

type SourcePort = Readonly<{
  load(
    input: { organizationId: string; caseId: string },
  ): Promise<RequestManifestSourceReference>;
}>;
type StoragePort = Readonly<{
  download(bucketId: string, objectKey: string): Promise<Uint8Array | null>;
}>;
type InterpreterPort = Parameters<
  typeof createRequestManifestDraftService
>[0]["interpreter"];

export function createRequestManifestJobService(options: {
  source: SourcePort;
  storage: StoragePort;
  interpreter: InterpreterPort;
  store: RequestManifestDraftStore;
  clock?: () => Date;
}) {
  const drafts = createRequestManifestDraftService({
    interpreter: options.interpreter,
    store: options.store,
    clock: options.clock,
  });
  return Object.freeze({
    async analyze(input: {
      organizationId: string;
      caseId: string;
      correlationId: string;
    }) {
      const reference = await options.source.load(input);
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
        ) throw new Error("REQUEST_MANIFEST_ATTACHMENT_LIMIT");
        documents.push(Object.freeze({
          versionId: document.versionId,
          sourceName: document.sourceName,
          contentType: document.contentType,
          sourceSha256: document.sourceSha256,
          sourceSafety: document.sourceSafety,
          bytes: Uint8Array.from(bytes),
        }));
      }
      const result = await drafts.run(Object.freeze({
        organizationId: reference.organizationId,
        caseId: reference.caseId,
        message: reference.message,
        documents: Object.freeze(documents),
        knowledgeCatalog: reference.knowledgeCatalog,
      }));
      return Object.freeze({
        correlationId: input.correlationId,
        receipt: result.receipt,
        evidenceSha256: result.evidenceSha256,
        sourceCoverage: result.manifest.sourceCoverage,
        readiness: result.manifest.readiness,
        status: "review_required" as const,
        externalEffects: false as const,
      });
    },
  });
}
