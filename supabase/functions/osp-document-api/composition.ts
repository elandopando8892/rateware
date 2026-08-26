import { createKindeJwtVerifier } from '../osp-read-api/kinde-jwt.ts';
import { OSP_PRODUCTION_ORGANIZATION_BINDING } from '../osp-read-api/auth-policy.ts';
import { createDocumentService } from './document-service.ts';
import { createDocumentApiHandler } from './handler.ts';
import { createManagedMalwareScanner } from './managed-malware-scanner.ts';
import { createPostgresDocumentStore, type PostgresFactory } from './postgres-document-store.ts';
import { createSupabaseDocumentStoragePort, type DocumentStorageClient } from './supabase-storage-port.ts';

export type DocumentApiEnvironment = { get(name: string): string | undefined };
export type DocumentApiRuntimeOptions = {
  env: DocumentApiEnvironment;
  fetch: typeof globalThis.fetch;
  postgresFactory: PostgresFactory;
  storageClient: DocumentStorageClient;
  clock?: () => number;
};

function required(env: DocumentApiEnvironment, name: string): string {
  const value = env.get(name);
  if (typeof value !== 'string' || value.trim() === '') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  return value.trim();
}

function issuer(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '' && parsed.pathname !== '/')) throw new Error('INVALID_RUNTIME_CONFIGURATION');
    return parsed.origin;
  } catch { throw new Error('INVALID_RUNTIME_CONFIGURATION'); }
}

export function createDocumentApiRuntime(options: DocumentApiRuntimeOptions): (request: Request) => Promise<Response> {
  const kindeIssuer = issuer(required(options.env, 'OSP_KINDE_ISSUER'));
  const clientId = required(options.env, 'OSP_KINDE_CLIENT_ID');
  const databaseUrl = options.env.get('OSP_DOCUMENT_DATABASE_URL')?.trim() || required(options.env, 'SUPABASE_DB_URL');
  const scannerOrigin = required(options.env, 'OSP_MALWARE_SCANNER_ORIGIN');
  const scannerToken = required(options.env, 'OSP_MALWARE_SCANNER_TOKEN');
  const verifier = createKindeJwtVerifier({
    issuer: kindeIssuer,
    clientId,
    jwksFetch: options.fetch,
    clock: options.clock ?? Date.now,
    organizationBinding: OSP_PRODUCTION_ORGANIZATION_BINDING,
  });
  const store = createPostgresDocumentStore({ databaseUrl, postgresFactory: options.postgresFactory });
  const storage = createSupabaseDocumentStoragePort({ client: options.storageClient });
  const documentService = createDocumentService({
    scan: createManagedMalwareScanner({ origin: scannerOrigin, token: scannerToken, fetch: options.fetch }),
    putPrivateObject: storage.putPrivateObject,
    deletePrivateObject: storage.deletePrivateObject,
    createVersion: store.createVersion,
    approveVersion: store.approveVersion,
  });
  return createDocumentApiHandler({
    verifyToken: (token, signal) => verifier.verifyWorkflow(token, signal),
    listVersions: store.listVersions,
    documentService,
  });
}
