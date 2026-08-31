import postgres from 'npm:postgres@3.4.7';

import { type SqlPort, type SqlRow, withOrganizationTransaction } from '../_shared/osp/database-context.ts';
import { assessDuplicates, type DuplicateCandidate, type DuplicateSignal } from '../_shared/osp/duplicate-engine.ts';
import { requireUuid, sha256Hex } from '../_shared/osp/source-hash.ts';
import type { ParsedCopiedRequest } from '../_shared/osp/gmail-envelope.ts';
import type { IntakePersistence, IntakeSource } from './intake-service.ts';

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
export type PostgresIntakePersistenceOptions = {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
};

function requireDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      url.search || url.hash
    ) throw new Error('INVALID_RUNTIME_CONFIGURATION');
    return value;
  } catch {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
}

function requireHash(value: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('INVALID_SOURCE_OBJECT');
  return value.toLowerCase();
}

function requireObjectKey(value: string): string {
  const parts = value.split('/');
  if (parts.length !== 2) throw new Error('INVALID_SOURCE_OBJECT');
  return `${requireUuid(parts[0])}/${requireUuid(parts[1])}`;
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return [];
  }
  return Object.freeze(value);
}

function timestamp(value: unknown): string {
  const parsed = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error('DATABASE_TEMPORARY');
  }
  return parsed.toISOString();
}

function candidate(row: SqlRow): DuplicateCandidate {
  if (
    typeof row.case_id !== 'string' ||
    typeof row.gmail_message_id !== 'string' ||
    typeof row.raw_mime_hash !== 'string' ||
    typeof row.gmail_thread_id !== 'string' ||
    typeof row.supplier_domain !== 'string'
  ) {
    throw new Error('DATABASE_TEMPORARY');
  }
  return Object.freeze({
    caseId: row.case_id,
    gmailMessageId: row.gmail_message_id,
    rawMimeHash: row.raw_mime_hash,
    attachmentHashes: strings(row.attachment_hashes),
    gmailThreadId: row.gmail_thread_id,
    supplierDomain: row.supplier_domain,
    applicationReference: typeof row.application_reference === 'string' ? row.application_reference : null,
    receivedAt: timestamp(row.received_at),
    requirementTokens: strings(row.requirement_tokens),
  });
}

function evidenceFor(
  candidateCaseId: string,
  evidence: readonly DuplicateSignal[],
): string {
  return JSON.stringify(
    evidence.filter((item) => item.sourceIds.includes(candidateCaseId)),
  );
}

function stableSource(source: IntakeSource): Record<string, unknown> {
  return {
    gmailMessageId: source.gmailMessageId,
    gmailThreadId: source.gmailThreadId,
    rawMimeHash: source.rawMimeHash,
    attachmentHashes: [...source.attachmentHashes].sort(),
    attachments: source.attachments.map(({ sha256, contentType }) => ({
      sha256,
      contentType,
    })).sort((left, right) => canonical(left).localeCompare(canonical(right))),
    receivedAt: source.receivedAt,
  };
}

function stableParsed(parsed: ParsedCopiedRequest): Record<string, unknown> {
  return {
    senderEmail: parsed.senderEmail,
    senderDomain: parsed.senderDomain,
    internetMessageId: parsed.internetMessageId,
    supplierDomain: parsed.supplierDomain,
    to: [...parsed.to],
    cc: [...parsed.cc],
    subject: parsed.subject,
    safeBody: parsed.safeBody,
    requirementTokens: [...parsed.requirementTokens],
    applicationReference: parsed.applicationReference,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(
      ',',
    )
  }}`;
}

async function requestHash(value: unknown): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(canonical(value)));
}

function receiptResponse(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error('DATABASE_TEMPORARY');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DATABASE_TEMPORARY');
  }
  return value as Record<string, unknown>;
}

function createdResponse(value: unknown): { caseId: string; eventId: string } {
  const response = receiptResponse(value);
  if (
    typeof response.caseId !== 'string' || typeof response.eventId !== 'string'
  ) throw new Error('DATABASE_TEMPORARY');
  return { caseId: response.caseId, eventId: response.eventId };
}

function heldResponse(value: unknown): { caseId: string } {
  const response = receiptResponse(value);
  if (typeof response.caseId !== 'string') {
    throw new Error('DATABASE_TEMPORARY');
  }
  return { caseId: response.caseId };
}

function refreshResponse(
  value: unknown,
): { caseId: string; eventId: string | null } {
  const response = receiptResponse(value);
  if (
    typeof response.caseId !== 'string' ||
    (response.eventId !== null && typeof response.eventId !== 'string')
  ) throw new Error('DATABASE_TEMPORARY');
  return {
    caseId: response.caseId,
    eventId: response.eventId as string | null,
  };
}

async function withReceipt<T>(
  tx: SqlPort,
  organizationId: string,
  operation: string,
  idempotencyKey: string,
  request: unknown,
  parse: (value: unknown) => T,
  effect: () => Promise<T>,
): Promise<T> {
  if (!/^[A-Za-z0-9:_-]{1,256}$/.test(idempotencyKey)) {
    throw new Error('INVALID_DELIVERY_KEY');
  }
  const hash = await requestHash(request);
  const lockKey = canonical([organizationId, operation, idempotencyKey]);
  await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const prior = await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${organizationId} and operation = ${operation} and idempotency_key = ${idempotencyKey}`;
  if (prior.length === 1) {
    if (prior[0].request_hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
    return parse(prior[0].response_json);
  }
  const response = await effect();
  await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${organizationId}, ${operation}, ${idempotencyKey}, ${hash}, ${JSON.stringify(response)}::text::jsonb)`;
  return response;
}

async function persistSource(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
  source: IntakeSource,
  parsed: ParsedCopiedRequest,
  evidence: readonly DuplicateSignal[] = [],
): Promise<void> {
  const messageId = crypto.randomUUID();
  const rawMimeKey = requireObjectKey(source.rawMimeKey);
  const rawMimeHash = requireHash(source.rawMimeHash);
  if (!Number.isFinite(Date.parse(source.receivedAt))) {
    throw new Error('INVALID_SOURCE_OBJECT');
  }
  const existing = await tx`select id, case_id, source_sha256, gmail_thread_id from osp_private.gmail_messages where organization_id = ${organizationId} and gmail_message_id = ${source.gmailMessageId}`;
  if (existing.length > 1) throw new Error('DATABASE_TEMPORARY');
  if (existing.length === 1) {
    const row = existing[0];
    if (
      typeof row.id !== 'string' || row.case_id !== caseId ||
      row.source_sha256 !== rawMimeHash ||
      row.gmail_thread_id !== source.gmailThreadId
    ) throw new Error('IDEMPOTENCY_CONFLICT');
    if (evidence.length > 0) {
      await tx`update osp_private.gmail_messages set duplicate_evidence_json = ${JSON.stringify(evidence)}::text::jsonb where organization_id = ${organizationId} and id = ${row.id}`;
    }
    return;
  }
  const toJson = JSON.stringify([...parsed.to]);
  const ccJson = JSON.stringify([...parsed.cc]);
  const requirementTokensJson = JSON.stringify([...parsed.requirementTokens]);
  await tx`insert into osp_private.gmail_messages (id, organization_id, gmail_message_id, gmail_thread_id, case_id, opaque_object_key, source_sha256, sender_email, sender_domain, internet_message_id, subject, to_addresses, cc_addresses, safe_body, application_reference, requirement_tokens, duplicate_evidence_json, received_at) values (${messageId}, ${organizationId}, ${source.gmailMessageId}, ${source.gmailThreadId}, ${caseId}, ${rawMimeKey}, ${rawMimeHash}, ${parsed.senderEmail}, ${parsed.senderDomain}, ${parsed.internetMessageId}, ${parsed.subject}, (select coalesce(array_agg(item.value order by item.ordinality), '{}'::text[]) from jsonb_array_elements_text(${toJson}::text::jsonb) with ordinality as item(value, ordinality)), (select coalesce(array_agg(item.value order by item.ordinality), '{}'::text[]) from jsonb_array_elements_text(${ccJson}::text::jsonb) with ordinality as item(value, ordinality)), ${parsed.safeBody}, ${parsed.applicationReference}, (select coalesce(array_agg(item.value order by item.ordinality), '{}'::text[]) from jsonb_array_elements_text(${requirementTokensJson}::text::jsonb) with ordinality as item(value, ordinality)), ${JSON.stringify(evidence)}::text::jsonb, ${source.receivedAt})`;
  for (const attachment of source.attachments) {
    await tx`insert into osp_private.gmail_attachments (id, organization_id, gmail_message_id, opaque_object_key, source_sha256, content_type) values (${crypto.randomUUID()}, ${organizationId}, ${messageId}, ${requireObjectKey(attachment.objectKey)}, ${requireHash(attachment.sha256)}, ${attachment.contentType})`;
  }
}

async function persistCandidates(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
  candidateIds: readonly string[],
  evidence: readonly DuplicateSignal[],
): Promise<void> {
  for (const candidateCaseId of [...new Set(candidateIds)].sort()) {
    const related = evidence.filter((item) => item.sourceIds.includes(candidateCaseId));
    const score = Math.min(
      1,
      related.reduce((total, item) => total + item.score, 0),
    );
    await tx`insert into osp_private.duplicate_candidates (id, organization_id, case_id, candidate_case_id, score, evidence_json) values (${crypto.randomUUID()}, ${organizationId}, ${caseId}, ${candidateCaseId}, ${score}, ${evidenceFor(candidateCaseId, evidence)}::text::jsonb) on conflict (organization_id, case_id, candidate_case_id) do update set score = excluded.score, evidence_json = excluded.evidence_json`;
  }
}

async function appendEvent(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
  reason: string,
  correlationId: string,
  evidence: readonly DuplicateSignal[] = [],
): Promise<string> {
  const eventId = crypto.randomUUID();
  const locked = await tx`select id, aggregate_version from osp_private.customer_registration_cases where organization_id = ${organizationId} and id = ${caseId} for update`;
  if (
    locked.length !== 1 ||
    (typeof locked[0].aggregate_version !== 'number' &&
      typeof locked[0].aggregate_version !== 'string')
  ) throw new Error('DATABASE_TEMPORARY');
  const sourceVersion = Number(locked[0].aggregate_version);
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 0) {
    throw new Error('DATABASE_TEMPORARY');
  }
  const next = await tx`select coalesce(max(sequence), 0) + 1 as sequence from osp_private.case_events where organization_id = ${organizationId} and case_id = ${caseId}`;
  const sequence = Number(next[0]?.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('DATABASE_TEMPORARY');
  }
  const updated = await tx`update osp_private.customer_registration_cases set aggregate_version = aggregate_version + 1, updated_at = now() where organization_id = ${organizationId} and id = ${caseId} and aggregate_version = ${sourceVersion} returning aggregate_version`;
  if (updated.length !== 1) throw new Error('VERSION_CONFLICT');
  await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${eventId}, ${organizationId}, ${caseId}, ${sequence}, 'received', 'osp-worker', 'workflow', ${sourceVersion}, now(), ${reason}, ${correlationId}, ${JSON.stringify(evidence)}::text::jsonb)`;
  return eventId;
}

async function appendReviewEvent(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
  correlationId: string,
  evidence: readonly DuplicateSignal[],
): Promise<string> {
  const locked = await tx`select id, aggregate_version from osp_private.customer_registration_cases where organization_id = ${organizationId} and id = ${caseId} for update`;
  if (
    locked.length !== 1 ||
    typeof locked[0].aggregate_version !== 'number' &&
      typeof locked[0].aggregate_version !== 'string'
  ) throw new Error('DATABASE_TEMPORARY');
  const sourceVersion = Number(locked[0].aggregate_version);
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 0) {
    throw new Error('DATABASE_TEMPORARY');
  }
  const next = await tx`select coalesce(max(sequence), 0) + 1 as sequence from osp_private.case_events where organization_id = ${organizationId} and case_id = ${caseId}`;
  const sequence = Number(next[0]?.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('DATABASE_TEMPORARY');
  }
  const updated = await tx`update osp_private.customer_registration_cases set blocked_by_duplicate_review = true, aggregate_version = aggregate_version + 1, updated_at = now() where organization_id = ${organizationId} and id = ${caseId} returning aggregate_version`;
  if (updated.length !== 1) throw new Error('VERSION_CONFLICT');
  const eventId = crypto.randomUUID();
  await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${eventId}, ${organizationId}, ${caseId}, ${sequence}, 'received', 'osp-worker', 'workflow', ${sourceVersion}, now(), 'duplicate_review_refresh', ${correlationId}, ${JSON.stringify(evidence)}::text::jsonb)`;
  return eventId;
}

async function queryDuplicates(
  tx: SqlPort,
  organizationId: string,
): Promise<readonly DuplicateCandidate[]> {
  const rows = await tx`select c.id as case_id, gm.gmail_message_id, gm.source_sha256 as raw_mime_hash, gm.gmail_thread_id, s.legal_name as supplier_domain, gm.received_at, gm.application_reference, gm.requirement_tokens, coalesce(array_agg(ga.source_sha256) filter (where ga.source_sha256 is not null), '{}') as attachment_hashes from osp_private.customer_registration_cases c join osp_private.supplier_counterparties s on s.organization_id = c.organization_id and s.id = c.supplier_id join osp_private.gmail_messages gm on gm.organization_id = c.organization_id and gm.case_id = c.id left join osp_private.gmail_attachments ga on ga.organization_id = gm.organization_id and ga.gmail_message_id = gm.id where c.organization_id = ${organizationId} group by c.id, gm.gmail_message_id, gm.source_sha256, gm.gmail_thread_id, s.legal_name, gm.received_at, gm.application_reference, gm.requirement_tokens`;
  return rows.map(candidate);
}

export function createPostgresIntakePersistence(
  options: PostgresIntakePersistenceOptions,
): IntakePersistence {
  const created = (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
    requireDatabaseUrl(options.databaseUrl),
    {
      ssl: 'verify-full',
      fetch_types: false,
      prepare: false,
      max: 1,
      connect_timeout: 5,
      connection: {
        application_name: 'osp-gmail-intake',
        statement_timeout: '3000',
      },
    },
  );
  if (typeof created !== 'function') {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
  const sql = created as SqlPort;
  const findDuplicates = async (
    organizationId: string,
    _source: DuplicateCandidate,
  ): Promise<readonly DuplicateCandidate[]> =>
    await withOrganizationTransaction(
      sql,
      organizationId,
      async (tx) => await queryDuplicates(tx, organizationId),
    );
  return Object.freeze({
    findDuplicates,
    async createCase(input) {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const request = {
            source: stableSource(input.source),
            parsed: stableParsed(input.parsed),
          };
          return await withReceipt(
            tx,
            input.organizationId,
            'gmail_intake_create',
            input.deliveryIdempotencyKey,
            request,
            createdResponse,
            async () => {
              const supplierRows = await tx`insert into osp_private.supplier_counterparties (id, organization_id, legal_name) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.parsed.supplierDomain}) on conflict (organization_id, legal_name) do update set legal_name = excluded.legal_name returning id`;
              if (
                supplierRows.length !== 1 ||
                typeof supplierRows[0].id !== 'string'
              ) throw new Error('DATABASE_TEMPORARY');
              const caseId = crypto.randomUUID();
              await tx`insert into osp_private.customer_registration_cases (id, organization_id, supplier_id, state, gmail_message_id, blocked_by_duplicate_review) values (${caseId}, ${input.organizationId}, ${supplierRows[0].id}, 'received', ${input.source.gmailMessageId}, false)`;
              await persistSource(
                tx,
                input.organizationId,
                caseId,
                input.source,
                input.parsed,
              );
              const eventId = await appendEvent(
                tx,
                input.organizationId,
                caseId,
                'gmail_intake_created',
                input.deliveryIdempotencyKey,
              );
              return { caseId, eventId };
            },
          );
        },
      );
    },
    async attachExact(input) {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const request = {
            existingCaseId: input.existingCaseId,
            source: stableSource(input.source),
            parsed: stableParsed(input.parsed),
            evidence: input.evidence,
          };
          return await withReceipt(
            tx,
            input.organizationId,
            'gmail_intake_attach_exact',
            input.deliveryIdempotencyKey,
            request,
            createdResponse,
            async () => {
              await persistSource(
                tx,
                input.organizationId,
                input.existingCaseId,
                input.source,
                input.parsed,
                input.evidence,
              );
              const eventId = await appendEvent(
                tx,
                input.organizationId,
                input.existingCaseId,
                'gmail_intake_attached_exact',
                input.deliveryIdempotencyKey,
                input.evidence,
              );
              return { caseId: input.existingCaseId, eventId };
            },
          );
        },
      );
    },
    async holdForReview(input) {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const request = {
            source: stableSource(input.source),
            parsed: stableParsed(input.parsed),
            candidateIds: input.candidateIds,
            evidence: input.evidence,
          };
          return await withReceipt(
            tx,
            input.organizationId,
            'gmail_intake_hold_duplicate_review',
            input.deliveryIdempotencyKey,
            request,
            heldResponse,
            async () => {
              const supplierRows = await tx`insert into osp_private.supplier_counterparties (id, organization_id, legal_name) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.parsed.supplierDomain}) on conflict (organization_id, legal_name) do update set legal_name = excluded.legal_name returning id`;
              if (
                supplierRows.length !== 1 ||
                typeof supplierRows[0].id !== 'string'
              ) throw new Error('DATABASE_TEMPORARY');
              const caseId = crypto.randomUUID();
              await tx`insert into osp_private.customer_registration_cases (id, organization_id, supplier_id, state, gmail_message_id, blocked_by_duplicate_review) values (${caseId}, ${input.organizationId}, ${supplierRows[0].id}, 'received', ${input.source.gmailMessageId}, true)`;
              await persistSource(
                tx,
                input.organizationId,
                caseId,
                input.source,
                input.parsed,
                input.evidence,
              );
              await persistCandidates(
                tx,
                input.organizationId,
                caseId,
                input.candidateIds,
                input.evidence,
              );
              await appendEvent(
                tx,
                input.organizationId,
                caseId,
                'duplicate_review_required',
                input.deliveryIdempotencyKey,
                input.evidence,
              );
              return { caseId };
            },
          );
        },
      );
    },
    async refreshDuplicateReview(input) {
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) =>
          await withReceipt(
            tx,
            input.organizationId,
            'duplicate_review_refresh',
            input.correlationId,
            { caseId: input.caseId },
            refreshResponse,
            async () => {
              const all = await queryDuplicates(tx, input.organizationId);
              const current = all.find((item) => item.caseId === input.caseId);
              if (!current) throw new Error('DATABASE_TEMPORARY');
              const assessment = assessDuplicates(
                current,
                all.filter((item) => item.caseId !== input.caseId),
              );
              if (assessment.outcome !== 'probable') {
                return { caseId: input.caseId, eventId: null };
              }
              await persistCandidates(
                tx,
                input.organizationId,
                input.caseId,
                assessment.candidateCaseIds,
                assessment.evidence,
              );
              const eventId = await appendReviewEvent(
                tx,
                input.organizationId,
                input.caseId,
                input.correlationId,
                assessment.evidence,
              );
              return { caseId: input.caseId, eventId };
            },
          ),
      );
    },
  });
}
