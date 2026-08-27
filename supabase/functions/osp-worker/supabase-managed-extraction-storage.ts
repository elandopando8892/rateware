import type { SupabaseClient } from "supabase";

import type { ManagedExtractionStorage } from "./managed-extraction.ts";

type SimpleClient = {
  download(bucket: string, key: string): Promise<Uint8Array | null>;
};
export type ManagedExtractionStorageClient =
  | Pick<SupabaseClient, "storage">
  | SimpleClient;

function simple(
  client: ManagedExtractionStorageClient,
): client is SimpleClient {
  return "download" in client;
}

export function createSupabaseManagedExtractionStorage(options: {
  client: ManagedExtractionStorageClient;
}): ManagedExtractionStorage {
  const storage: ManagedExtractionStorage = {
    async download(input) {
      try {
        if (simple(options.client)) {
          const bytes = await options.client.download(
            input.bucketId,
            input.objectKey,
          );
          if (!bytes) throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
          return bytes;
        }
        const result = await options.client.storage.from(input.bucketId)
          .download(
            input.objectKey,
          );
        if (result.error || !result.data) {
          throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
        }
        return new Uint8Array(await result.data.arrayBuffer());
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "STORAGE_DOWNLOAD_TEMPORARY"
        ) throw error;
        throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
      }
    },
  };
  return Object.freeze(storage);
}
