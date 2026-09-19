export type OriginalObject = { key: string; sha256: string; filename?: never };
export type OriginalObjectInput = {
  organizationId: string;
  bytes: Uint8Array;
  contentType: string;
  originalFilename?: string;
  /** Digest already calculated from these bytes by a guarded source parser. */
  preverifiedSha256?: string;
};

export interface OriginalObjectStore {
  put(
    input: OriginalObjectInput,
    signal?: AbortSignal,
  ): Promise<OriginalObject>;
}
