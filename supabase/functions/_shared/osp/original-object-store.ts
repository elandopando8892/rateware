export type OriginalObject = { key: string; sha256: string; filename?: never };
export type OriginalObjectInput = { organizationId: string; bytes: Uint8Array; contentType: string; originalFilename?: string };

export interface OriginalObjectStore {
  put(input: OriginalObjectInput, signal?: AbortSignal): Promise<OriginalObject>;
}
