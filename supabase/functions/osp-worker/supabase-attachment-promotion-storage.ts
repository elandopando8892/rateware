import type { SupabaseClient } from "supabase";

import type { AttachmentPromotionStorage } from "./attachment-promotion.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";

type SimpleClient = {
  download(bucket: string, key: string): Promise<Uint8Array | null>;
  upload(
    bucket: string,
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  createSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string>;
};

export type AttachmentStorageClient =
  | Pick<SupabaseClient, "storage">
  | SimpleClient;

function isSimple(client: AttachmentStorageClient): client is SimpleClient {
  return "download" in client && "upload" in client;
}

async function download(
  client: AttachmentStorageClient,
  bucket: string,
  key: string,
): Promise<Uint8Array | null> {
  if (isSimple(client)) return await client.download(bucket, key);
  const result = await client.storage.from(bucket).download(key);
  if (result.error || !result.data) return null;
  return new Uint8Array(await result.data.arrayBuffer());
}

export function createSupabaseAttachmentPromotionStorage(options: {
  client: AttachmentStorageClient;
}): AttachmentPromotionStorage {
  const storage: AttachmentPromotionStorage = {
    async downloadOriginal(input) {
      try {
        const bytes = await download(
          options.client,
          "osp-originals",
          input.objectKey,
        );
        if (!bytes) throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
        return bytes;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "STORAGE_DOWNLOAD_TEMPORARY"
        ) throw error;
        throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
      }
    },
    async createOriginalReadUrl(input) {
      if (
        !Number.isSafeInteger(input.expiresInSeconds) ||
        input.expiresInSeconds < 15 || input.expiresInSeconds > 120
      ) throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
      try {
        const value = isSimple(options.client)
          ? await options.client.createSignedUrl(
            "osp-originals",
            input.objectKey,
            input.expiresInSeconds,
          )
          : await (async () => {
            const client = options.client as Pick<SupabaseClient, "storage">;
            const result = await client.storage.from("osp-originals")
              .createSignedUrl(input.objectKey, input.expiresInSeconds, {
                download: true,
              });
            if (result.error) throw result.error;
            return result.data?.signedUrl;
          })();
        if (typeof value !== "string") {
          throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
        }
        const parsed = new URL(value);
        if (
          parsed.protocol !== "https:" || parsed.username || parsed.password ||
          parsed.hash
        ) throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
        return value;
      } catch {
        throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
      }
    },
    async putCorporate(input) {
      try {
        if (await sha256Hex(input.bytes) !== input.sourceSha256) {
          throw new Error("SOURCE_HASH_MISMATCH");
        }
        if (isSimple(options.client)) {
          try {
            await options.client.upload(
              "osp-corporate-documents",
              input.objectKey,
              input.bytes,
              input.contentType,
            );
          } catch {
            // A retry may observe the deterministic object already present.
          }
        } else {
          const result = await options.client.storage.from(
            "osp-corporate-documents",
          ).upload(input.objectKey, input.bytes, {
            contentType: input.contentType,
            upsert: false,
          });
          if (result.error) {
            // Resolve ambiguous/duplicate writes by verifying the target below.
          }
        }
        const persisted = await download(
          options.client,
          "osp-corporate-documents",
          input.objectKey,
        );
        if (!persisted) throw new Error("STORAGE_UPLOAD_TEMPORARY");
        if (await sha256Hex(persisted) !== input.sourceSha256) {
          throw new Error("SOURCE_HASH_MISMATCH");
        }
      } catch (error) {
        if (
          error instanceof Error &&
          ["SOURCE_HASH_MISMATCH", "STORAGE_UPLOAD_TEMPORARY"].includes(
            error.message,
          )
        ) throw error;
        throw new Error("STORAGE_UPLOAD_TEMPORARY");
      }
    },
  };
  return Object.freeze(storage);
}
