import type {
  ManagedExtractionStorage,
  ManagedExtractionStore,
} from "./managed-extraction.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { parseXlsxStructure } from "./xlsx-structure.ts";
import {
  parseRatewareXlsxQuote,
  type RatewareXlsxQuote,
} from "./rateware-xlsx-quote.ts";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type RatewareXlsxCanaryInput = Readonly<{
  organizationId: string;
  caseId: string;
  jobId: string;
  documentVersionId: string;
  sourceSha256: string;
}>;

export type RatewareXlsxCanaryReceipt = Readonly<{
  rawUploadId: string;
  interpretationJobId: string;
  rateStagingId: string;
  inserted: boolean;
}>;

export interface RatewareXlsxCanaryStore {
  stage(
    input: RatewareXlsxCanaryInput & {
      quote: RatewareXlsxQuote;
    },
  ): Promise<RatewareXlsxCanaryReceipt>;
}

export function createRatewareXlsxCanaryService(deps: {
  sources: ManagedExtractionStore;
  storage: ManagedExtractionStorage;
  staging: RatewareXlsxCanaryStore;
}) {
  return Object.freeze({
    async stage(
      input: RatewareXlsxCanaryInput,
    ): Promise<RatewareXlsxCanaryReceipt> {
      const source = await deps.sources.load({
        organizationId: input.organizationId,
        documentVersionId: input.documentVersionId,
      });
      if (
        source.caseId !== input.caseId ||
        source.sourceSha256 !== input.sourceSha256 ||
        source.contentType !== XLSX
      ) throw new Error("INVALID_INPUT");
      const bytes = await deps.storage.download({
        bucketId: source.bucketId,
        objectKey: source.objectKey,
      });
      if (await sha256Hex(bytes) !== input.sourceSha256) {
        throw new Error("SOURCE_HASH_MISMATCH");
      }
      const quote = parseRatewareXlsxQuote(
        await parseXlsxStructure({
          sourceVersionId: source.documentVersionId,
          bytes,
        }),
      );
      return await deps.staging.stage({ ...input, quote });
    },
  });
}
