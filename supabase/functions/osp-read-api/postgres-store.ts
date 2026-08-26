import postgres from 'npm:postgres@3.4.7';

import type { OspAuthorizationIdentity } from './auth-policy.ts';
import { OspApiError } from './http.ts';
import type { GmailSeamRow, OspReadStore, PipelineSeamRow } from './store.ts';

type QueryLike<T> = PromiseLike<T>;
type SqlPort = (strings: TemplateStringsArray, ...values: unknown[]) => QueryLike<unknown[]>;
export type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type PostgresOspReadStoreOptions = {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATEMENT_TIMEOUT_MS = 3_000;

function requireDatabaseUrl(value: string): string {
  try {
    if (value.trim() !== value) throw new Error('INVALID_RUNTIME_CONFIGURATION');
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

async function executeQuery(
  query: QueryLike<unknown[]>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<unknown[]> {
  return await new Promise<unknown[]>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      operation();
    };
    const abort = () => {
      finish(() => reject(new OspApiError('DEPENDENCY_UNAVAILABLE')));
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, timeoutMs);
    Promise.resolve(query).then(
      (rows) => finish(() => resolve(rows)),
      () => finish(() => reject(new OspApiError('DEPENDENCY_UNAVAILABLE'))),
    );
  });
}

async function executeTaggedQuery(
  createQuery: () => QueryLike<unknown[]>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<unknown[]> {
  try {
    return await executeQuery(createQuery(), signal, timeoutMs);
  } catch (error) {
    if (error instanceof OspApiError) throw error;
    throw new OspApiError('DEPENDENCY_UNAVAILABLE');
  }
}

function exactlyOneRow(
  rows: unknown,
  code: 'WORKSPACE_UNAVAILABLE' | 'DEPENDENCY_UNAVAILABLE',
): Record<string, unknown> {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] ||
      typeof rows[0] !== 'object' || Array.isArray(rows[0])) {
    throw new OspApiError(code);
  }
  return rows[0] as Record<string, unknown>;
}

export function createPostgresOspReadStore({
  databaseUrl,
  postgresFactory = postgres as unknown as PostgresFactory,
}: PostgresOspReadStoreOptions): OspReadStore {
  const validatedDatabaseUrl = requireDatabaseUrl(databaseUrl);
  const created = postgresFactory(validatedDatabaseUrl, {
    ssl: 'verify-full',
    fetch_types: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
    connection: {
      application_name: 'osp-read-api',
      statement_timeout: '3000',
      default_transaction_read_only: 'on',
    },
  });
  if (typeof created !== 'function') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const sql = created as SqlPort;

  return Object.freeze({
    async resolveWorkspace(identity: OspAuthorizationIdentity, signal?: AbortSignal): Promise<string> {
      const { issuer, subject, organization, email } = identity;
      const rows = await executeTaggedQuery(() => sql`
        SELECT organization_id
        FROM osp_identity_workspace_v1
        WHERE issuer = ${issuer}
          AND subject = ${subject}
          AND organization_code = ${organization}
          AND lower(btrim(email)) = ${email}
          AND identity_active = true
          AND organization_reviewed = true
          AND workspace_active = true
      `, signal, STATEMENT_TIMEOUT_MS);
      const row = exactlyOneRow(rows, 'WORKSPACE_UNAVAILABLE');
      if (typeof row.organization_id !== 'string' || !UUID_PATTERN.test(row.organization_id)) {
        throw new OspApiError('WORKSPACE_UNAVAILABLE');
      }
      return row.organization_id;
    },

    async readPipeline(organizationId: string, signal?: AbortSignal): Promise<PipelineSeamRow> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT requests_total, documents_pending, under_review, ready_for_approval
        FROM osp_provider_onboarding_metrics_v1
        WHERE organization_id = ${organizationId}
      `, signal, STATEMENT_TIMEOUT_MS);
      return exactlyOneRow(rows, 'DEPENDENCY_UNAVAILABLE') as PipelineSeamRow;
    },

    async readGmail(organizationId: string, signal?: AbortSignal): Promise<GmailSeamRow> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT connection_exists, pubsub_configured, watch_configured,
               token_expires_at, watch_expires_at, error_present, error_code
        FROM osp_provider_gmail_health_v1
        WHERE organization_id = ${organizationId}
      `, signal, STATEMENT_TIMEOUT_MS);
      return exactlyOneRow(rows, 'DEPENDENCY_UNAVAILABLE') as GmailSeamRow;
    },
  });
}
