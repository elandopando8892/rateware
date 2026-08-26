import { createOspReadHandler } from './handler.ts';
import { createKindeJwtVerifier } from './kinde-jwt.ts';
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

function requireIssuer(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        (url.pathname !== '' && url.pathname !== '/')) {
      throw new Error('INVALID_RUNTIME_CONFIGURATION');
    }
    return url.origin;
  } catch {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
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
  const issuer = requireIssuer(requiredEnvironment(env, 'OSP_KINDE_ISSUER'));
  const clientId = requiredEnvironment(env, 'OSP_KINDE_CLIENT_ID');
  const databaseUrl = requireDatabaseUrl(
    env.get('OSP_READ_DATABASE_URL')?.trim() || requiredEnvironment(env, 'SUPABASE_DB_URL'),
  );
  const verifier = createKindeJwtVerifier({ issuer, clientId, jwksFetch, clock });
  const store = createPostgresOspReadStore({ databaseUrl, postgresFactory });
  return createOspReadHandler({
    verifyToken: (token, signal) => verifier.verify(token, signal),
    store,
  });
}
