import postgres from 'npm:postgres@3.4.7';

import type { OspAuthorizationIdentity } from './auth-policy.ts';
import { OspApiError } from './http.ts';
import type { CaseDetailSeamRow, CaseSummarySeamRow, CorporateProfileSeamRow, GmailSeamRow, OspReadStore, PipelineSeamRow } from './store.ts';

type QueryLike<T> = PromiseLike<T>;
type SqlPort = (strings: TemplateStringsArray, ...values: unknown[]) => QueryLike<unknown[]>;
export type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type PostgresOspReadStoreOptions = {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
  pubsubConfigured?: boolean;
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
  pubsubConfigured = false,
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
      const { subject, organization, externalOrganization, email } = identity;
      const organizationCode = externalOrganization ?? organization;
      const rows = await executeTaggedQuery(() => sql`
        SELECT organization_link.organization_id
        FROM public.external_identities identity_record
        JOIN public.external_organization_links organization_link
          ON organization_link.provider = identity_record.provider
        WHERE identity_record.provider = 'kinde'
          AND identity_record.external_subject = ${subject}
          AND lower(btrim(identity_record.email)) = ${email}
          AND identity_record.status = 'active'
          AND identity_record.reviewed_at IS NOT NULL
          AND organization_link.external_organization_id = ${organizationCode}
          AND organization_link.organization_id = ${organization}
          AND organization_link.status = 'active'
          AND organization_link.reviewed_at IS NOT NULL
      `, signal, STATEMENT_TIMEOUT_MS);
      const row = exactlyOneRow(rows, 'WORKSPACE_UNAVAILABLE');
      if (typeof row.organization_id !== 'string' || !UUID_PATTERN.test(row.organization_id)) {
        throw new OspApiError('WORKSPACE_UNAVAILABLE');
      }
      return row.organization_id;
    },

    async readPipeline(organizationId: string, signal?: AbortSignal): Promise<PipelineSeamRow> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT
          count(*)::bigint AS requests_total,
          count(*) FILTER (WHERE state IN (
            'received', 'analyzing_requirements', 'awaiting_clarification',
            'awaiting_xbf_information', 'preparing'
          ))::bigint AS documents_pending,
          count(*) FILTER (WHERE state = 'operations_review')::bigint AS under_review,
          count(*) FILTER (WHERE state IN (
            'signature_approval', 'sales_authorization'
          ))::bigint AS ready_for_approval
        FROM osp_private.customer_registration_cases
        WHERE organization_id = ${organizationId}
      `, signal, STATEMENT_TIMEOUT_MS);
      return exactlyOneRow(rows, 'DEPENDENCY_UNAVAILABLE') as PipelineSeamRow;
    },

    async readGmail(organizationId: string, signal?: AbortSignal): Promise<GmailSeamRow> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT
          count(*) > 0 AS connection_exists,
          CASE WHEN count(*) = 0 THEN NULL
            ELSE ${pubsubConfigured}
          END AS pubsub_configured,
          CASE WHEN count(*) = 0 THEN NULL
            ELSE bool_or(status = 'watching' AND watch_expiration_at > statement_timestamp())
          END AS watch_configured,
          CASE WHEN count(*) = 0 THEN NULL ELSE control.gmail_poll_enabled END AS scheduled_poll_configured,
          CASE WHEN count(*) = 0 THEN NULL ELSE control.gmail_poll_interval_seconds END AS poll_interval_seconds,
          CASE WHEN count(*) = 0 THEN NULL ELSE control.gmail_poll_last_completed_at END AS poll_last_completed_at,
          CASE WHEN count(*) = 0 THEN NULL ELSE control.gmail_poll_last_status END AS poll_status,
          CASE WHEN count(*) = 0 THEN NULL ELSE max(token_expires_at) END AS token_expires_at,
          CASE WHEN bool_or(status = 'watching' AND watch_expiration_at > statement_timestamp())
            THEN max(watch_expiration_at) FILTER (
              WHERE status = 'watching' AND watch_expiration_at > statement_timestamp()
            )
            ELSE NULL
          END AS watch_expires_at,
          CASE WHEN count(*) = 0 THEN false
            ELSE bool_or(status = 'error' OR last_error IS NOT NULL) OR (control.gmail_poll_enabled AND control.gmail_poll_last_status = 'failed')
          END AS error_present,
          CASE WHEN bool_or(status = 'error' OR last_error IS NOT NULL)
            THEN 'PROVIDER_CONNECTION_ERROR'
            WHEN control.gmail_poll_enabled AND control.gmail_poll_last_status = 'failed'
            THEN 'UPSTREAM_UNAVAILABLE'
            ELSE NULL
          END AS error_code
        FROM public.provider_gmail_connections
        CROSS JOIN osp_private.production_controls control
        WHERE organization_id = ${organizationId}
          AND purpose = 'provider_onboarding'
          AND mailbox_email = 'carriers@xbfreight.com'
          AND control.id = 'singleton'
        GROUP BY control.gmail_poll_enabled, control.gmail_poll_interval_seconds,
          control.gmail_poll_last_completed_at, control.gmail_poll_last_status
      `, signal, STATEMENT_TIMEOUT_MS);
      return exactlyOneRow(rows, 'DEPENDENCY_UNAVAILABLE') as GmailSeamRow;
    },

    async readCases(organizationId: string, signal?: AbortSignal): Promise<readonly CaseSummarySeamRow[]> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT
          case_record.id AS case_id,
          supplier.legal_name AS supplier_name,
          case_record.state,
          case_record.aggregate_version,
          case_record.blocked_by_duplicate_review,
          case_record.created_at,
          case_record.updated_at,
          (SELECT count(*)::bigint FROM osp_private.gmail_messages message
            WHERE message.organization_id = case_record.organization_id AND message.case_id = case_record.id) AS message_count,
          (SELECT count(*)::bigint FROM osp_private.gmail_attachments attachment
            JOIN osp_private.gmail_messages message ON message.organization_id = attachment.organization_id AND message.id = attachment.gmail_message_id
            WHERE message.organization_id = case_record.organization_id AND message.case_id = case_record.id) AS attachment_count,
          (SELECT count(*)::bigint FROM osp_private.documents document
            WHERE document.organization_id = case_record.organization_id AND document.case_id = case_record.id) AS document_count
        FROM osp_private.customer_registration_cases case_record
        JOIN osp_private.supplier_counterparties supplier
          ON supplier.organization_id = case_record.organization_id AND supplier.id = case_record.supplier_id
        WHERE case_record.organization_id = ${organizationId}
        ORDER BY case_record.updated_at DESC, case_record.id ASC
        LIMIT 100
      `, signal, STATEMENT_TIMEOUT_MS);
      return rows as CaseSummarySeamRow[];
    },

    async readCase(organizationId: string, caseId: string, signal?: AbortSignal): Promise<CaseDetailSeamRow> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT
          case_record.id AS case_id,
          supplier.legal_name AS supplier_name,
          case_record.state,
          case_record.aggregate_version,
          case_record.blocked_by_duplicate_review,
          case_record.created_at,
          case_record.updated_at,
          (SELECT count(*)::bigint FROM osp_private.gmail_messages message
            WHERE message.organization_id = case_record.organization_id AND message.case_id = case_record.id) AS message_count,
          (SELECT count(*)::bigint FROM osp_private.gmail_attachments attachment
            JOIN osp_private.gmail_messages message ON message.organization_id = attachment.organization_id AND message.id = attachment.gmail_message_id
            WHERE message.organization_id = case_record.organization_id AND message.case_id = case_record.id) AS attachment_count,
          (SELECT count(*)::bigint FROM osp_private.documents document
            WHERE document.organization_id = case_record.organization_id AND document.case_id = case_record.id) AS document_count,
          latest_message.subject AS latest_subject,
          latest_message.sender_domain AS latest_sender_domain,
          latest_message.received_at AS latest_received_at,
          COALESCE((
            SELECT jsonb_agg(to_jsonb(recent_event) ORDER BY recent_event.sequence DESC)
            FROM (
              SELECT event.sequence, event.state, event.occurred_at, event.reason_code
              FROM osp_private.case_events event
              WHERE event.organization_id = case_record.organization_id AND event.case_id = case_record.id
              ORDER BY event.sequence DESC
              LIMIT 20
            ) recent_event
          ), '[]'::jsonb) AS recent_events
        FROM osp_private.customer_registration_cases case_record
        JOIN osp_private.supplier_counterparties supplier
          ON supplier.organization_id = case_record.organization_id AND supplier.id = case_record.supplier_id
        LEFT JOIN LATERAL (
          SELECT NULLIF(btrim(message.subject), '') AS subject, message.sender_domain, message.received_at
          FROM osp_private.gmail_messages message
          WHERE message.organization_id = case_record.organization_id AND message.case_id = case_record.id
          ORDER BY message.received_at DESC, message.id ASC
          LIMIT 1
        ) latest_message ON true
        WHERE case_record.organization_id = ${organizationId} AND case_record.id = ${caseId}
      `, signal, STATEMENT_TIMEOUT_MS);
      return exactlyOneRow(rows, 'DEPENDENCY_UNAVAILABLE') as CaseDetailSeamRow;
    },

    async readCorporateProfile(organizationId: string, reviewerSubject: string, signal?: AbortSignal): Promise<readonly CorporateProfileSeamRow[]> {
      const rows = await executeTaggedQuery(() => sql`
        SELECT
          entity.id AS entity_id,
          entity.entity_code,
          entity.legal_name,
          entity.country_code,
          entity.default_currency,
          entity.status,
          count(field.id) FILTER (WHERE field.verification_status = 'verified')::bigint AS verified_fields,
          count(field.id) FILTER (WHERE field.verification_status = 'needs_review')::bigint AS review_fields,
          count(field.id)::bigint AS total_fields,
          COALESCE(jsonb_agg(jsonb_build_object(
            'code', field.field_code,
            'label', field.field_label,
            'display_value', CASE
              WHEN field.sensitivity IN ('restricted','highly_restricted')
                THEN CASE WHEN field.field_code LIKE 'bank_%' OR field.sensitivity = 'highly_restricted' THEN 'Withheld' ELSE 'On file' END
              WHEN field.field_code IN ('mc_number','usdot_number') THEN 'On file'
              WHEN jsonb_typeof(field.field_value) = 'string' THEN field.field_value #>> '{}'
              WHEN jsonb_typeof(field.field_value) IN ('number','boolean') THEN field.field_value #>> '{}'
              ELSE 'On file'
            END,
            'verification_status', field.verification_status,
            'sensitivity', field.sensitivity,
            'support_status', CASE
              WHEN EXISTS (
                SELECT 1 FROM public.provider_legal_entity_facts exact_fact
                WHERE exact_fact.organization_id = field.organization_id
                  AND exact_fact.legal_entity_id = field.legal_entity_id
                  AND exact_fact.field_code = field.field_code
                  AND exact_fact.fact_status = 'current'
                  AND exact_fact.fact_value = field.field_value
              ) THEN 'verified_match'
              WHEN EXISTS (
                SELECT 1 FROM public.provider_legal_entity_facts current_fact
                WHERE current_fact.organization_id = field.organization_id
                  AND current_fact.legal_entity_id = field.legal_entity_id
                  AND current_fact.field_code = field.field_code
                  AND current_fact.fact_status = 'current'
              ) THEN 'conflict'
              WHEN EXISTS (
                SELECT 1
                FROM public.provider_entity_document_reviews candidate_review
                JOIN public.provider_entity_document_review_fields candidate_field
                  ON candidate_field.organization_id = candidate_review.organization_id
                 AND candidate_field.review_id = candidate_review.id
                WHERE candidate_review.organization_id = field.organization_id
                  AND candidate_review.legal_entity_id = field.legal_entity_id
                  AND candidate_field.field_code = field.field_code
                  AND candidate_review.review_status IN ('pending','in_review','approved','changes_required')
                  AND candidate_field.field_status <> 'rejected'
              ) THEN 'evidence_available'
              ELSE 'unsupported'
            END,
            'evidence_candidate_count', (
              SELECT count(DISTINCT candidate_review.document_asset_id)::bigint
              FROM public.provider_entity_document_reviews candidate_review
              JOIN public.provider_entity_document_review_fields candidate_field
                ON candidate_field.organization_id = candidate_review.organization_id
               AND candidate_field.review_id = candidate_review.id
              WHERE candidate_review.organization_id = field.organization_id
                AND candidate_review.legal_entity_id = field.legal_entity_id
                AND candidate_field.field_code = field.field_code
                AND candidate_review.review_status IN ('pending','in_review','approved','changes_required')
                AND candidate_field.field_status <> 'rejected'
            ),
            'reviewed_candidate_count', (
              SELECT count(DISTINCT reviewed_review.document_asset_id)::bigint
              FROM public.provider_entity_document_reviews reviewed_review
              JOIN public.provider_entity_document_review_fields reviewed_field
                ON reviewed_field.organization_id = reviewed_review.organization_id
               AND reviewed_field.review_id = reviewed_review.id
              WHERE reviewed_review.organization_id = field.organization_id
                AND reviewed_review.legal_entity_id = field.legal_entity_id
                AND reviewed_field.field_code = field.field_code
                AND reviewed_review.review_status = 'approved'
                AND reviewed_field.field_status IN ('accepted','corrected')
            ),
            'review_candidates', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'review_id', candidate_review.id::text,
                'review_field_id', candidate_field.id::text,
                'review_revision', candidate_review.revision,
                'review_status', candidate_review.review_status,
                'ownership', CASE
                  WHEN candidate_review.review_status = 'pending' AND candidate_review.assigned_reviewer_user_id IS NULL THEN 'available'
                  WHEN candidate_review.review_status = 'in_review' AND candidate_review.assigned_reviewer_user_id = ${reviewerSubject} THEN 'owned'
                  ELSE 'locked'
                END,
                'field_status', candidate_field.field_status,
                'document_type', candidate_asset.document_type,
                'evidence_label', initcap(replace(candidate_asset.document_type, '_', ' ')),
                'proposed_display_value', CASE
                  WHEN candidate_field.sensitivity IN ('restricted','highly_restricted') THEN 'Withheld'
                  WHEN jsonb_typeof(candidate_field.proposed_value) IN ('string','number','boolean') THEN candidate_field.proposed_value #>> '{}'
                  ELSE 'On file'
                END,
                'pending_field_count', (
                  SELECT count(*)::bigint FROM public.provider_entity_document_review_fields pending_field
                  WHERE pending_field.organization_id = candidate_review.organization_id
                    AND pending_field.review_id = candidate_review.id
                    AND pending_field.field_status = 'pending'
                ),
                'total_field_count', (
                  SELECT count(*)::bigint FROM public.provider_entity_document_review_fields total_field
                  WHERE total_field.organization_id = candidate_review.organization_id
                    AND total_field.review_id = candidate_review.id
                )
              ) ORDER BY candidate_review.requested_at, candidate_review.id, candidate_field.id)
              FROM public.provider_entity_document_reviews candidate_review
              JOIN public.provider_entity_document_review_fields candidate_field
                ON candidate_field.organization_id = candidate_review.organization_id
               AND candidate_field.review_id = candidate_review.id
              JOIN public.provider_legal_entity_document_assets candidate_asset
                ON candidate_asset.organization_id = candidate_review.organization_id
               AND candidate_asset.id = candidate_review.document_asset_id
              WHERE candidate_review.organization_id = field.organization_id
                AND candidate_review.legal_entity_id = field.legal_entity_id
                AND candidate_field.field_code = field.field_code
                AND candidate_review.review_status IN ('pending','in_review')
            ), '[]'::jsonb)
          ) ORDER BY field.field_code) FILTER (WHERE field.id IS NOT NULL), '[]'::jsonb) AS fields,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'review_id', approved_review.id::text,
              'review_revision', approved_review.revision,
              'document_type', approved_asset.document_type,
              'evidence_label', initcap(replace(approved_asset.document_type, '_', ' ')),
              'candidate_sha256', osp_private.profile_review_candidate_sha256(
                approved_review.organization_id, approved_review.id, approved_review.revision
              ),
              'candidate_count', (
                SELECT count(*)::bigint FROM public.provider_entity_document_review_fields candidate_field
                WHERE candidate_field.organization_id = approved_review.organization_id
                  AND candidate_field.review_id = approved_review.id
                  AND candidate_field.field_status IN ('accepted','corrected')
              ),
              'change_count', (
                SELECT count(*)::bigint
                FROM public.provider_entity_document_review_fields candidate_field
                LEFT JOIN public.provider_legal_entity_facts current_fact
                  ON current_fact.organization_id = candidate_field.organization_id
                 AND current_fact.legal_entity_id = approved_review.legal_entity_id
                 AND current_fact.field_code = candidate_field.field_code
                 AND current_fact.fact_status = 'current'
                WHERE candidate_field.organization_id = approved_review.organization_id
                  AND candidate_field.review_id = approved_review.id
                  AND candidate_field.field_status IN ('accepted','corrected')
                  AND (current_fact.id IS NULL OR current_fact.fact_value IS DISTINCT FROM
                    CASE WHEN candidate_field.field_status = 'corrected'
                      THEN candidate_field.reviewer_value ELSE candidate_field.proposed_value END)
              ),
              'unchanged_count', (
                SELECT count(*)::bigint
                FROM public.provider_entity_document_review_fields candidate_field
                JOIN public.provider_legal_entity_facts current_fact
                  ON current_fact.organization_id = candidate_field.organization_id
                 AND current_fact.legal_entity_id = approved_review.legal_entity_id
                 AND current_fact.field_code = candidate_field.field_code
                 AND current_fact.fact_status = 'current'
                WHERE candidate_field.organization_id = approved_review.organization_id
                  AND candidate_field.review_id = approved_review.id
                  AND candidate_field.field_status IN ('accepted','corrected')
                  AND current_fact.fact_value = CASE WHEN candidate_field.field_status = 'corrected'
                    THEN candidate_field.reviewer_value ELSE candidate_field.proposed_value END
              ),
              'withheld_count', (
                SELECT count(*)::bigint FROM public.provider_entity_document_review_fields withheld_field
                WHERE withheld_field.organization_id = approved_review.organization_id
                  AND withheld_field.review_id = approved_review.id
                  AND withheld_field.field_status = 'withheld'
              ),
              'expected_current_fact_ids', COALESCE((
                SELECT jsonb_object_agg(
                  candidate_field.field_code,
                  COALESCE(to_jsonb(current_fact.id::text), 'null'::jsonb)
                )
                FROM public.provider_entity_document_review_fields candidate_field
                LEFT JOIN public.provider_legal_entity_facts current_fact
                  ON current_fact.organization_id = candidate_field.organization_id
                 AND current_fact.legal_entity_id = approved_review.legal_entity_id
                 AND current_fact.field_code = candidate_field.field_code
                 AND current_fact.fact_status = 'current'
                WHERE candidate_field.organization_id = approved_review.organization_id
                  AND candidate_field.review_id = approved_review.id
                  AND candidate_field.field_status IN ('accepted','corrected')
              ), '{}'::jsonb),
              'promotion_status', COALESCE(promotion.promotion_status, 'ready')
            ) ORDER BY approved_review.reviewed_at, approved_review.id)
            FROM public.provider_entity_document_reviews approved_review
            JOIN public.provider_legal_entity_document_assets approved_asset
              ON approved_asset.organization_id = approved_review.organization_id
             AND approved_asset.id = approved_review.document_asset_id
            LEFT JOIN public.provider_legal_entity_fact_promotions promotion
              ON promotion.organization_id = approved_review.organization_id
             AND promotion.review_id = approved_review.id
            WHERE approved_review.organization_id = entity.organization_id
              AND approved_review.legal_entity_id = entity.id
              AND approved_review.review_status = 'approved'
          ), '[]'::jsonb) AS promotion_candidates,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'name', initcap(replace(asset.document_type, '_', ' ')),
              'document_type', asset.document_type,
              'verification_status', asset.verification_status,
              'sensitivity', asset.sensitivity,
              'release_policy', asset.release_policy,
              'expiry_state', CASE
                WHEN asset.expiration_date IS NULL THEN 'no_expiry'
                WHEN asset.expiration_date < current_date THEN 'expired'
                WHEN asset.expiration_date <= current_date + 30 THEN 'expiring_soon'
                ELSE 'current'
              END
            ) ORDER BY asset.document_type, asset.document_key)
            FROM public.provider_legal_entity_document_assets asset
            WHERE asset.organization_id = entity.organization_id
              AND asset.legal_entity_id = entity.id
              AND asset.lifecycle_status = 'active'
          ), '[]'::jsonb) AS evidence
        FROM public.legal_entities entity
        LEFT JOIN public.provider_legal_entity_profile_fields field
          ON field.organization_id = entity.organization_id
         AND field.legal_entity_id = entity.id
         AND field.lifecycle_status = 'active'
        WHERE entity.organization_id = ${organizationId}
          AND entity.status IN ('draft','active')
        GROUP BY entity.organization_id, entity.id, entity.entity_code, entity.legal_name,
          entity.country_code, entity.default_currency, entity.status
        ORDER BY entity.entity_code
        LIMIT 10
      `, signal, STATEMENT_TIMEOUT_MS);
      return rows as CorporateProfileSeamRow[];
    },
  });
}
