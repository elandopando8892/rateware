import type { SupabaseClient } from 'supabase';

import { type OriginalObject, type OriginalObjectInput, type OriginalObjectStore } from '../_shared/osp/original-object-store.ts';
import { requireUuid, sha256Hex } from '../_shared/osp/source-hash.ts';

export type PrivateObjectClient = Pick<SupabaseClient, 'storage'> | { upload(key: string, bytes: Uint8Array, contentType: string): Promise<void>; download(key: string): Promise<Uint8Array | null> };

function isSimpleClient(client: PrivateObjectClient): client is { upload(key: string, bytes: Uint8Array, contentType: string): Promise<void>; download(key: string): Promise<Uint8Array | null> } {
  return 'upload' in client && 'download' in client;
}

export function createSupabaseOriginalObjectStore(options: { client: PrivateObjectClient; bucket?: string; uuid?: () => string }): OriginalObjectStore {
  const uuid = options.uuid ?? crypto.randomUUID;
  const bucket = options.bucket ?? 'osp-originals';
  if (!/^[a-z0-9-]{3,63}$/.test(bucket)) throw new Error('INVALID_STORAGE_CONFIGURATION');
  return Object.freeze({
    async put(input: OriginalObjectInput): Promise<OriginalObject> {
      const organizationId = requireUuid(input.organizationId);
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 || input.bytes.byteLength > 25 * 1024 * 1024 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.contentType)) throw new Error('INVALID_SOURCE_OBJECT');
      const key = `${organizationId}/${requireUuid(uuid())}`;
      if (isSimpleClient(options.client)) await options.client.upload(key, input.bytes, input.contentType);
      else {
        const client = options.client as Pick<SupabaseClient, 'storage'>;
        const result = await client.storage.from(bucket).upload(key, input.bytes, { contentType: input.contentType, upsert: false });
        if (result.error) throw new Error('STORAGE_TEMPORARY');
      }
      const downloaded = isSimpleClient(options.client)
        ? await options.client.download(key)
        : await (async () => { const result = await (options.client as Pick<SupabaseClient, 'storage'>).storage.from(bucket).download(key); return result.error || !result.data ? null : new Uint8Array(await result.data.arrayBuffer()); })();
      if (!downloaded || await sha256Hex(downloaded) !== await sha256Hex(input.bytes)) throw new Error('SOURCE_HASH_MISMATCH');
      return Object.freeze({ key, sha256: await sha256Hex(input.bytes) });
    },
  });
}
