import { createOspReadHandler } from './handler.ts';
import { createOspRuntimeJwtVerifier } from './auth-runtime.ts';
import { OSP_PRODUCTION_ORGANIZATION_BINDING } from './auth-policy.ts';
import {
  createPostgresOspReadStore,
  type PostgresFactory,
} from './postgres-store.ts';

export type EnvironmentPort = {
  get(name: string): string | undefined;
};

export type OspReadRuntimeOptions = {
  env: EnvironmentPort;
  jwksFetch: typeof fetch;
  postgresFactory: PostgresFactory;
  clock?: () => number;
};

function requiredEnvironment(env: EnvironmentPort, name: string): string {
  const value = env.get(name);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
  return value.trim();
}

function requireDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get('sslmode');
    const allowedSslQuery = url.searchParams.size === 1 && ['require', 'prefer'].includes(sslMode ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        (url.search && !allowedSslQuery) || url.hash) {
      throw new Error('INVALID_RUNTIME_CONFIGURATION');
    }
    return sslMode === 'prefer' ? value.replace(/\?sslmode=prefer$/, '?sslmode=require') : value;
  } catch {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
}

export function createOspReadRuntime({
  env,
  jwksFetch,
  postgresFactory,
  clock = Date.now,
}: OspReadRuntimeOptions): (request: Request) => Promise<Response> {
  const databaseUrl = requireDatabaseUrl(
    env.get('OSP_READ_DATABASE_URL')?.trim() || requiredEnvironment(env, 'SUPABASE_DB_URL'),
  );
  const pubsubConfigured = [
    'PROVIDER_GMAIL_PUBSUB_TOPIC',
    'PROVIDER_GMAIL_PUBSUB_AUDIENCE',
    'PROVIDER_GMAIL_PUBSUB_SERVICE_ACCOUNT',
  ].every((name) => Boolean(env.get(name)?.trim()));
  const verifier = createOspRuntimeJwtVerifier({
    env,
    fetch: jwksFetch,
    clock,
    organizationBinding: OSP_PRODUCTION_ORGANIZATION_BINDING,
  });
  const store = createPostgresOspReadStore({
    databaseUrl,
    postgresFactory,
    pubsubConfigured,
  });
  return createOspReadHandler({
    verifyToken: (token, signal) => verifier.verify(token, signal),
    store,
  });
}
