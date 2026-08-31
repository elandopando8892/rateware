import { createOspRuntimeJwtVerifier } from '../osp-read-api/auth-runtime.ts';
import {
  OSP_PRODUCTION_OPERATOR_ENTITLEMENTS,
  OSP_PRODUCTION_ORGANIZATION_BINDING,
} from '../osp-read-api/auth-policy.ts';
import { createFormApiHandler } from './handler.ts';
import { createPostgresFormStore } from './postgres-store.ts';

type Environment = { get(name: string): string | undefined };
type PostgresFactory = (databaseUrl: string, options: Record<string, unknown>) => unknown;

function required(env: Environment, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new Error('INVALID_RUNTIME_CONFIGURATION');
  return value;
}

export function createFormApiRuntime(options: { env: Environment; fetch: typeof globalThis.fetch; postgresFactory?: PostgresFactory; clock?: () => number }) {
  const verifier = createOspRuntimeJwtVerifier({
    env: options.env, fetch: options.fetch,
    clock: options.clock ?? Date.now, organizationBinding: OSP_PRODUCTION_ORGANIZATION_BINDING,
    operatorEntitlements: OSP_PRODUCTION_OPERATOR_ENTITLEMENTS,
  });
  return createFormApiHandler({
    verifyToken: (token, signal) => verifier.verifyWorkflow(token, signal),
    store: createPostgresFormStore({ databaseUrl: options.env.get('OSP_CASE_DATABASE_URL')?.trim() || required(options.env, 'SUPABASE_DB_URL'), ...(options.postgresFactory ? { postgresFactory: options.postgresFactory } : {}) }),
    canonicalFieldIds: ['supplier.legalName', 'supplier.address', 'fiscal.taxIdentifier', 'banking.accountNumber'],
  });
}
