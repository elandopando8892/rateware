import type { RatewareXlsxQuote } from "./rateware-xlsx-quote.ts";

export type RatewareXlsxStageReceipt = Readonly<{
  rawUploadId: string;
  interpretationJobId: string;
  rateStagingId: string;
  inserted: boolean;
}>;

export interface RatewareXlsxStagingStore {
  stage(input: {
    organizationId: string;
    caseId: string;
    jobId: string;
    leaseToken: string;
    documentVersionId: string;
    sourceSha256: string;
    quote: RatewareXlsxQuote;
  }): Promise<RatewareXlsxStageReceipt>;
}
