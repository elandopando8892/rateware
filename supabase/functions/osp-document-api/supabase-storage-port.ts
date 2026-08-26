import type { SupabaseClient } from 'supabase';

type SimpleStorageClient = {
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
};
export type DocumentStorageClient = Pick<SupabaseClient, 'storage'> | SimpleStorageClient;

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

function isSimple(client: DocumentStorageClient): client is SimpleStorageClient {
  return 'upload' in client && 'download' in client && 'remove' in client;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validate(bucketId: string, opaqueObjectKey: string): void {
  if (bucketId !== 'osp-corporate-documents' || !KEY.test(opaqueObjectKey)) throw new Error('DOCUMENT_STORAGE_REJECTED');
}

export function createSupabaseDocumentStoragePort(options: { client: DocumentStorageClient }) {
  const deletePrivateObject = async (input: { bucketId: 'osp-corporate-documents'; opaqueObjectKey: string }): Promise<void> => {
    validate(input.bucketId, input.opaqueObjectKey);
    try {
      if (isSimple(options.client)) await options.client.remove(input.opaqueObjectKey);
      else {
        const supabaseClient = options.client as Pick<SupabaseClient, 'storage'>;
        const result = await supabaseClient.storage.from(input.bucketId).remove([input.opaqueObjectKey]);
        if (result.error) throw new Error('DOCUMENT_STORAGE_TEMPORARY');
      }
    } catch { throw new Error('DOCUMENT_STORAGE_TEMPORARY'); }
  };
  return Object.freeze({
    async putPrivateObject(input: { bucketId: 'osp-corporate-documents'; opaqueObjectKey: string; bytes: Uint8Array; contentType: string; sourceSha256: string }): Promise<void> {
      const { bucketId, opaqueObjectKey, contentType, sourceSha256 } = input;
      validate(bucketId, opaqueObjectKey);
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > 26_214_400 || !CONTENT_TYPES.has(contentType) || !SHA.test(sourceSha256) || await sha256(input.bytes) !== sourceSha256) throw new Error('DOCUMENT_STORAGE_REJECTED');
      const sourceBytes = input.bytes.slice();
      try {
        if (isSimple(options.client)) await options.client.upload(opaqueObjectKey, sourceBytes, contentType);
        else {
          const supabaseClient = options.client as Pick<SupabaseClient, 'storage'>;
          const result = await supabaseClient.storage.from(bucketId).upload(opaqueObjectKey, sourceBytes, { contentType, upsert: false });
          if (result.error) throw new Error('DOCUMENT_STORAGE_TEMPORARY');
        }
        const downloaded = isSimple(options.client)
          ? await options.client.download(opaqueObjectKey)
          : await (async () => {
            const supabaseClient = options.client as Pick<SupabaseClient, 'storage'>;
            const result = await supabaseClient.storage.from(bucketId).download(opaqueObjectKey);
            return result.error || !result.data ? null : new Uint8Array(await result.data.arrayBuffer());
          })();
        if (!downloaded || await sha256(downloaded) !== sourceSha256) {
          try { await deletePrivateObject({ bucketId, opaqueObjectKey }); } catch { /* orphan cleanup is retried operationally */ }
          throw new Error('DOCUMENT_STORAGE_INTEGRITY');
        }
      } catch (error) {
        if (error instanceof Error && ['DOCUMENT_STORAGE_INTEGRITY', 'DOCUMENT_STORAGE_TEMPORARY'].includes(error.message)) throw error;
        throw new Error('DOCUMENT_STORAGE_TEMPORARY');
      }
    },
    deletePrivateObject,
  });
}
