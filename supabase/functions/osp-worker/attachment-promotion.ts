import type { BackgroundJobStore } from "../_shared/osp/background-jobs.ts";

export type GmailAttachmentSource = Readonly<{
  id: string;
  organizationId: string;
  caseId: string;
  sourceObjectKey: string;
  sourceSha256: string;
  contentType: string;
}>;

export type RegisteredRequirementDocument = Readonly<{
  documentVersionId: string;
  templateVersionId: string | null;
}>;

export type SourceSafetyReason =
  | "managed_malware_scan_clean"
  | "strict_xlsx_package_policy";

export interface AttachmentPromotionStore {
  listCaseAttachments(input: {
    organizationId: string;
    caseId: string;
  }): Promise<readonly GmailAttachmentSource[]>;
  register(
    input: GmailAttachmentSource & {
      corporateObjectKey: string;
      sourceSafetyReason: SourceSafetyReason;
    },
  ): Promise<RegisteredRequirementDocument>;
}

export interface AttachmentPromotionStorage {
  downloadOriginal(input: {
    objectKey: string;
  }): Promise<Uint8Array>;
  createOriginalReadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string>;
  putCorporate(input: {
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
    sourceSha256: string;
  }): Promise<void>;
}

export interface AttachmentPromotionService {
  promoteCase(input: {
    organizationId: string;
    caseId: string;
    correlationId: string;
  }): Promise<readonly RegisteredRequirementDocument[]>;
}

type MalwareScanner = (
  input: {
    bytes: Uint8Array;
    sourceUrl: () => Promise<string>;
    sourceSha256: string;
    sizeBytes: number;
  },
) => Promise<"clean" | "infected" | "unknown">;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const LEGACY_EXTRACTION_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function validateSource(
  source: GmailAttachmentSource,
  organizationId: string,
  caseId: string,
): void {
  const objectKey = new RegExp(
    `^${organizationId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
  );
  if (
    source.organizationId !== organizationId || source.caseId !== caseId ||
    !UUID.test(source.id) || !UUID.test(source.organizationId) ||
    !UUID.test(source.caseId) ||
    !objectKey.test(source.sourceObjectKey) ||
    !SHA.test(source.sourceSha256) || !CONTENT_TYPES.has(source.contentType)
  ) throw new Error("INVALID_ATTACHMENT_SOURCE");
}

export function createAttachmentPromotionService(deps: {
  store: AttachmentPromotionStore;
  storage: AttachmentPromotionStorage;
  scan: MalwareScanner;
  sourceSafetyReason?: SourceSafetyReason;
  contentTypes?: readonly string[];
  jobs: Pick<BackgroundJobStore, "enqueue">;
}): AttachmentPromotionService {
  const contentTypes = deps.contentTypes
    ? new Set(deps.contentTypes)
    : undefined;
  if (
    contentTypes?.size === 0 ||
    [...contentTypes ?? []].some((value) => !CONTENT_TYPES.has(value))
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const service: AttachmentPromotionService = {
    async promoteCase(input) {
      if (!UUID.test(input.organizationId) || !UUID.test(input.caseId)) {
        throw new Error("INVALID_INPUT");
      }
      const sources = await deps.store.listCaseAttachments(input);
      const promoted: RegisteredRequirementDocument[] = [];
      for (const source of sources) {
        validateSource(source, input.organizationId, input.caseId);
        if (contentTypes && !contentTypes.has(source.contentType)) continue;
        const bytes = await deps.storage.downloadOriginal({
          objectKey: source.sourceObjectKey,
        });
        if (await sha256(bytes) !== source.sourceSha256) {
          throw new Error("SOURCE_HASH_MISMATCH");
        }
        if (
          await deps.scan({
            bytes: bytes.slice(),
            sourceUrl: () =>
              deps.storage.createOriginalReadUrl({
                objectKey: source.sourceObjectKey,
                expiresInSeconds: 60,
              }),
            sourceSha256: source.sourceSha256,
            sizeBytes: bytes.byteLength,
          }) !== "clean"
        ) {
          throw new Error("MALWARE_SCAN_REJECTED");
        }
        const corporateObjectKey = `${input.organizationId}/${source.id}`;
        await deps.storage.putCorporate({
          objectKey: corporateObjectKey,
          bytes: bytes.slice(),
          contentType: source.contentType,
          sourceSha256: source.sourceSha256,
        });
        const registered = await deps.store.register({
          ...source,
          corporateObjectKey,
          sourceSafetyReason: deps.sourceSafetyReason ??
            "managed_malware_scan_clean",
        });
        if (LEGACY_EXTRACTION_CONTENT_TYPES.has(source.contentType)) {
          await deps.jobs.enqueue({
            organizationId: input.organizationId,
            kind: "document_extract",
            opaquePayload: {
              documentVersionId: registered.documentVersionId,
            },
            idempotencyKey: `extract:${registered.documentVersionId}`,
          });
        }
        promoted.push(registered);
      }
      return Object.freeze(promoted);
    },
  };
  return Object.freeze(service);
}
