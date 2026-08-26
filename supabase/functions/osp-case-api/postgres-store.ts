import postgres from 'npm:postgres@3.4.7';

import { withOrganizationTransaction, type SqlPort, type SqlRow } from '../_shared/osp/database-context.ts';
import type { OspAuthorityContext } from '../_shared/osp/workflow-authority.ts';
import type { CaseEvent, CaseState, OspWriteCommand } from '../_shared/osp/workflow-contracts.ts';
import { buildClarificationDraft, reviewClarificationDraft, type ClarificationDraft } from '../osp-worker/clarification-draft.ts';
import type {
  AddCommentCommand, AssignCaseCommand, CaseDetail, CasePage, CaseStore, CaseTransaction,
  ResolveDuplicateCommand, SaveClarificationDraftCommand,
} from './store.ts';

type PostgresFactory = (databaseUrl: string, options: Record<string, unknown>) => unknown;
type Row = SqlRow;

export type PostgresCaseStoreOptions = { databaseUrl: string; postgresFactory?: PostgresFactory };
type MemoryCase = CaseDetail & { assigneeSubject?: string };
type MemorySeed = Omit<CaseDetail, 'blockedByDuplicateReview'> & { blockedByDuplicateReview?: boolean };
type Receipt = { requestHash: string; response: CaseDetail };

function fail(code: string): never { throw new Error(code); }

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

function assertCommand(command: OspWriteCommand<string, unknown>): void {
  if (command.version !== 1 || !/^[A-Za-z0-9:_-]{1,256}$/.test(command.idempotency_key) || !Number.isSafeInteger(command.expected_version) || command.expected_version < 0) {
    fail('INVALID_COMMAND');
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
}

async function requestHash(command: OspWriteCommand<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(command));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function asCase(row: Row, organizationId: string): CaseDetail {
  if (typeof row === 'string') {
    try { row = JSON.parse(row) as Row; } catch { fail('CASE_NOT_FOUND'); }
  }
  const supplierId = row.supplier_id ?? row.supplierId;
  const aggregateVersionValue = row.aggregate_version ?? row.aggregateVersion;
  if (typeof row.id !== 'string' || typeof supplierId !== 'string' || typeof row.state !== 'string' ||
      (typeof aggregateVersionValue !== 'number' && typeof aggregateVersionValue !== 'string')) fail('CASE_NOT_FOUND');
  const aggregateVersion = Number(aggregateVersionValue);
  if (!Number.isSafeInteger(aggregateVersion) || aggregateVersion < 0) fail('CASE_NOT_FOUND');
  return {
    id: row.id,
    organizationId,
    state: row.state as CaseState,
    aggregateVersion,
    supplierId,
    blockedByDuplicateReview: row.blocked_by_duplicate_review === true || row.blockedByDuplicateReview === true,
  };
}

function requireDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (value.trim() !== value || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.search || url.hash) fail('INVALID_RUNTIME_CONFIGURATION');
    return value;
  } catch { fail('INVALID_RUNTIME_CONFIGURATION'); }
}

async function locked<T>(lock: { current: Promise<void> }, action: () => Promise<T>): Promise<T> {
  const previous = lock.current;
  let release!: () => void;
  lock.current = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await action(); } finally { release(); }
}

export function createInMemoryCaseStore(seed: readonly MemorySeed[]): CaseStore {
  const cases = new Map<string, MemoryCase>(seed.map((item) => [item.id, { ...item, blockedByDuplicateReview: item.blockedByDuplicateReview ?? false }]));
  const events = new Set<string>();
  const receipts = new Map<string, Receipt>();
  const lock = { current: Promise.resolve() };

  async function mutate(authority: OspAuthorityContext, command: OspWriteCommand<string, { caseId: string }>, effect: (item: MemoryCase) => void): Promise<CaseDetail> {
    return await locked(lock, async () => {
      assertCommand(command);
      const key = `${authority.organizationId}\u0000${command.action}\u0000${command.idempotency_key}`;
      const hash = await requestHash(command);
      const prior = receipts.get(key);
      if (prior) {
        if (prior.requestHash !== hash) fail('IDEMPOTENCY_CONFLICT');
        return { ...prior.response };
      }
      const item = cases.get(command.input.caseId);
      if (!item || item.organizationId !== authority.organizationId) fail('CASE_NOT_FOUND');
      if (item.aggregateVersion !== command.expected_version) fail('VERSION_CONFLICT');
      effect(item);
      item.aggregateVersion += 1;
      const response = { ...item };
      receipts.set(key, { requestHash: hash, response });
      return response;
    });
  }

  return Object.freeze({
    async transactCommand<T>(authority: OspAuthorityContext, command: OspWriteCommand<string, unknown>, operation: (tx: CaseTransaction) => Promise<T>) {
      assertCommand(command);
      return await locked(lock, async () => await operation({ transactionId: crypto.randomUUID(), organizationId: authority.organizationId }));
    },
    async listCases(authority: OspAuthorityContext, cursor: string | null, limit: number) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('INVALID_CURSOR');
      const values = [...cases.values()].filter((item) => item.organizationId === authority.organizationId).sort((a, b) => a.id.localeCompare(b.id));
      const start = cursor === null ? 0 : values.findIndex((item) => item.id === cursor) + 1;
      if (start < 0) fail('INVALID_CURSOR');
      const items = values.slice(start, start + limit).map((item) => ({ ...item }));
      return { items, nextCursor: start + limit < values.length ? items.at(-1)?.id ?? null : null };
    },
    async getCase(authority: OspAuthorityContext, caseId: string) {
      const item = cases.get(caseId);
      if (!item || item.organizationId !== authority.organizationId) fail('CASE_NOT_FOUND');
      return { ...item };
    },
    async appendEvent(tx: CaseTransaction, event: CaseEvent) {
      if (tx.organizationId !== event.organizationId || cases.get(event.caseId)?.organizationId !== tx.organizationId) fail('CASE_NOT_FOUND');
      const key = `${event.organizationId}\u0000${event.caseId}\u0000${event.sequence}`;
      if (events.has(key)) fail('APPEND_ONLY_CONFLICT');
      events.add(key);
    },
    async assignCase(authority: OspAuthorityContext, command: AssignCaseCommand) {
      return await mutate(authority, command, (item) => { item.assigneeSubject = command.input.assigneeSubject; });
    },
    async addComment(authority: OspAuthorityContext, command: AddCommentCommand) {
      return await mutate(authority, command, () => undefined);
    },
    async saveClarificationDraft(authority: OspAuthorityContext, command: SaveClarificationDraftCommand) {
      return await mutate(authority, command, () => undefined);
    },
    async resolveDuplicate(authority: OspAuthorityContext, command: ResolveDuplicateCommand) {
      return await mutate(authority, command, (item) => { if (command.input.resolution === 'link') item.blockedByDuplicateReview = false; });
    },
  });
}

export function createPostgresCaseStore({ databaseUrl, postgresFactory = postgres as unknown as PostgresFactory }: PostgresCaseStoreOptions): CaseStore {
  const created = postgresFactory(requireDatabaseUrl(databaseUrl), {
    ssl: 'verify-full', fetch_types: false, prepare: false, max: 1, connect_timeout: 5,
    connection: { application_name: 'osp-case-api', statement_timeout: '3000' },
  });
  if (typeof created !== 'function') fail('INVALID_RUNTIME_CONFIGURATION');
  const sql = created as SqlPort;
  const activeTransactions = new Map<string, SqlPort>();

  async function mutate(authority: OspAuthorityContext, command: OspWriteCommand<string, { caseId: string }>, statement: (tx: SqlPort) => Promise<SqlRow[] | void>): Promise<CaseDetail> {
    assertCommand(command);
    return await withOrganizationTransaction(sql, authority.organizationId, async (tx) => {
      const hash = await requestHash(command);
      const idempotencyLockKey = JSON.stringify([authority.organizationId, command.action, command.idempotency_key]);
      await tx`select pg_advisory_xact_lock(hashtextextended(${idempotencyLockKey}, 0))`;
      const prior = await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${authority.organizationId} and operation = ${command.action} and idempotency_key = ${command.idempotency_key}`;
      if (prior.length === 1) {
        if (prior[0].request_hash !== hash) fail('IDEMPOTENCY_CONFLICT');
        return asCase(prior[0].response_json as Row, authority.organizationId);
      }
      const rows = await tx`select id, supplier_id, state, aggregate_version, blocked_by_duplicate_review from osp_private.customer_registration_cases where organization_id = ${authority.organizationId} and id = ${command.input.caseId} for update`;
      if (rows.length !== 1) fail('CASE_NOT_FOUND');
      const current = asCase(rows[0], authority.organizationId);
      const committedReceipt = await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${authority.organizationId} and operation = ${command.action} and idempotency_key = ${command.idempotency_key}`;
      if (committedReceipt.length === 1) {
        if (committedReceipt[0].request_hash !== hash) fail('IDEMPOTENCY_CONFLICT');
        return asCase(committedReceipt[0].response_json as Row, authority.organizationId);
      }
      if (current.aggregateVersion !== command.expected_version) fail('VERSION_CONFLICT');
      const statementRows = await statement(tx);
      if (statementRows && statementRows.length !== 1) fail('DUPLICATE_NOT_FOUND');
      const updated = await tx`update osp_private.customer_registration_cases set aggregate_version = aggregate_version + 1, updated_at = now() where organization_id = ${authority.organizationId} and id = ${current.id} returning id, supplier_id, state, aggregate_version, blocked_by_duplicate_review`;
      if (updated.length !== 1) fail('VERSION_CONFLICT');
      const response = asCase(updated[0], authority.organizationId);
      await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id) values (${crypto.randomUUID()}, ${authority.organizationId}, ${current.id}, ${response.aggregateVersion}, ${response.state}, ${authority.subject}, 'operations', ${current.aggregateVersion}, now(), ${command.action}, ${authority.correlationId})`;
      try {
        await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${authority.organizationId}, ${command.action}, ${command.idempotency_key}, ${hash}, ${JSON.stringify(response)})`;
      } catch (error) {
        if (isUniqueViolation(error)) fail('IDEMPOTENCY_CONFLICT');
        throw error;
      }
      return response;
    });
  }

  return Object.freeze({
    async transactCommand<T>(authority: OspAuthorityContext, command: OspWriteCommand<string, unknown>, operation: (tx: CaseTransaction) => Promise<T>) {
      assertCommand(command);
      return await withOrganizationTransaction(sql, authority.organizationId, async (transaction) => {
        const transactionId = crypto.randomUUID();
        activeTransactions.set(transactionId, transaction);
        try { return await operation({ transactionId, organizationId: authority.organizationId }); }
        finally { activeTransactions.delete(transactionId); }
      });
    },
    async listCases(authority: OspAuthorityContext, cursor: string | null, limit: number) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('INVALID_CURSOR');
      const rows = await withOrganizationTransaction(sql, authority.organizationId, async (tx) => await tx`select id, supplier_id, state, aggregate_version, blocked_by_duplicate_review from osp_private.customer_registration_cases where organization_id = ${authority.organizationId} and (${cursor}::uuid is null or id > ${cursor}::uuid) order by id asc limit ${limit + 1}`);
      const items = rows.slice(0, limit).map((row) => asCase(row, authority.organizationId));
      return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null } as CasePage;
    },
    async getCase(authority: OspAuthorityContext, caseId: string) {
      const rows = await withOrganizationTransaction(sql, authority.organizationId, async (tx) => await tx`select id, supplier_id, state, aggregate_version, blocked_by_duplicate_review from osp_private.customer_registration_cases where organization_id = ${authority.organizationId} and id = ${caseId}`);
      if (rows.length !== 1) fail('CASE_NOT_FOUND');
      return asCase(rows[0], authority.organizationId);
    },
    async appendEvent(txn: CaseTransaction, event: CaseEvent) {
      if (txn.organizationId !== event.organizationId) fail('CASE_NOT_FOUND');
      const transaction = activeTransactions.get(txn.transactionId);
      if (!transaction) fail('TRANSACTION_CLOSED');
      await transaction`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id) values (${event.id}, ${event.organizationId}, ${event.caseId}, ${event.sequence}, ${event.state}, ${event.actorSubject}, ${event.authorityRole}, ${event.sourceVersion}, ${event.occurredAt}, ${event.reasonCode}, ${event.correlationId})`;
    },
    async assignCase(authority: OspAuthorityContext, command: AssignCaseCommand) {
      return await mutate(authority, command, async (tx) => { await tx`insert into osp_private.case_assignments (id, organization_id, case_id, assignee_subject, assigned_by_subject) values (${crypto.randomUUID()}, ${authority.organizationId}, ${command.input.caseId}, ${command.input.assigneeSubject}, ${authority.subject})`; });
    },
    async addComment(authority: OspAuthorityContext, command: AddCommentCommand) {
      return await mutate(authority, command, async (tx) => { await tx`insert into osp_private.case_comments (id, organization_id, case_id, body, author_subject) values (${crypto.randomUUID()}, ${authority.organizationId}, ${command.input.caseId}, ${command.input.body}, ${authority.subject})`; });
    },
    async saveClarificationDraft(authority: OspAuthorityContext, command: SaveClarificationDraftCommand) {
      return await mutate(authority, command, async (tx) => { await tx`insert into osp_private.clarification_drafts (id, organization_id, case_id, body, attachment_ids, created_by_subject) values (${crypto.randomUUID()}, ${authority.organizationId}, ${command.input.caseId}, ${command.input.body}, ${command.input.attachmentIds}, ${authority.subject})`; });
    },
    async resolveDuplicate(authority: OspAuthorityContext, command: ResolveDuplicateCommand) {
      return await mutate(authority, command, async (tx) => await tx`update osp_private.duplicate_candidates set resolution = ${command.input.resolution}, reason_code = ${command.input.reasonCode}, resolved_at = now() where id = ${command.input.candidateId} and case_id = ${command.input.caseId} and organization_id = ${authority.organizationId} returning id`);
    },
  });
}

export type ClarificationQuestion = ClarificationDraft['questions'][number];
export type ClarificationReviewSummary = {
  id: string;
  caseId: string;
  caseVersion: number;
  version: number;
  status: 'operations_review_required' | 'operations_reviewed';
  questions: readonly ClarificationQuestion[];
  evidenceIds: readonly string[];
  canonicalSha256: string;
  authorizationMailbox: 'sales@heymarksman.com';
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function clarificationQuestions(value: unknown): ClarificationDraft['questions'] {
  let decoded = value;
  if (typeof decoded === 'string') {
    try { decoded = JSON.parse(decoded); } catch { fail('CLARIFICATION_PERSISTENCE_FAILED'); }
  }
  if (!Array.isArray(decoded)) fail('CLARIFICATION_PERSISTENCE_FAILED');
  return decoded as ClarificationDraft['questions'];
}

function clarificationEvidence(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.some((item) => typeof item !== 'string')) fail('CLARIFICATION_PERSISTENCE_FAILED');
  return value as readonly string[];
}

function clarificationSummary(row: Row): ClarificationReviewSummary {
  const caseVersion = Number(row.case_version);
  const version = Number(row.version);
  if (typeof row.id !== 'string' || !UUID_PATTERN.test(row.id) || typeof row.case_id !== 'string' || !UUID_PATTERN.test(row.case_id) ||
      !Number.isSafeInteger(caseVersion) || caseVersion < 0 || !Number.isSafeInteger(version) || version < 1 ||
      (row.status !== 'operations_review_required' && row.status !== 'operations_reviewed') ||
      typeof row.canonical_sha256 !== 'string' || !SHA256_PATTERN.test(row.canonical_sha256) || row.authorization_mailbox !== 'sales@heymarksman.com') {
    fail('CLARIFICATION_PERSISTENCE_FAILED');
  }
  return Object.freeze({
    id: row.id,
    caseId: row.case_id,
    caseVersion,
    version,
    status: row.status,
    questions: clarificationQuestions(row.questions_json),
    evidenceIds: clarificationEvidence(row.evidence_ids),
    canonicalSha256: row.canonical_sha256,
    authorizationMailbox: 'sales@heymarksman.com' as const,
  });
}

export function createPostgresClarificationStore({ databaseUrl, postgresFactory = postgres as unknown as PostgresFactory }: PostgresCaseStoreOptions) {
  const created = postgresFactory(requireDatabaseUrl(databaseUrl), {
    ssl: 'verify-full', fetch_types: false, prepare: false, max: 1, connect_timeout: 5,
    connection: { application_name: 'osp-clarification-api', statement_timeout: '5000' },
  });
  if (typeof created !== 'function') fail('INVALID_RUNTIME_CONFIGURATION');
  const sql = created as SqlPort;
  return Object.freeze({
    async saveGeneratedDraft(input: {
      organizationId: string;
      draft: ClarificationDraft;
      correlationId: string;
    }): Promise<ClarificationReviewSummary> {
      if (!UUID_PATTERN.test(input.organizationId) || !UUID_PATTERN.test(input.draft?.caseId) ||
          !/^[A-Za-z0-9:_-]{1,256}$/.test(input.correlationId) || input.draft.status !== 'operations_review_required' ||
          input.draft.authorizationMailbox !== 'sales@heymarksman.com') fail('CLARIFICATION_GENERATION_REJECTED');
      const regenerated = await buildClarificationDraft({
        caseId: input.draft.caseId,
        evidenceIds: input.draft.evidenceIds,
        missing: input.draft.questions.filter((question) => question.kind === 'missing'),
        contradictions: input.draft.questions.filter((question) => question.kind === 'contradiction'),
      });
      if (regenerated.canonicalSha256 !== input.draft.canonicalSha256) fail('CLARIFICATION_GENERATION_REJECTED');
      const clarificationLockKey = `${input.organizationId}:${input.draft.caseId}:${input.draft.canonicalSha256}`;
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${clarificationLockKey}, 0))`;
        const existing = await tx`select draft.id, draft.case_id, case_record.aggregate_version as case_version, draft.version, draft.status, draft.questions_json, draft.evidence_ids, draft.canonical_sha256, draft.authorization_mailbox from osp_private.clarification_drafts draft join osp_private.customer_registration_cases case_record on case_record.organization_id = draft.organization_id and case_record.id = draft.case_id where draft.organization_id = ${input.organizationId} and draft.case_id = ${input.draft.caseId} and draft.canonical_sha256 = ${input.draft.canonicalSha256}`;
        if (existing.length === 1) return clarificationSummary(existing[0]);
        const cases = await tx`select id, state, aggregate_version from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.draft.caseId} for update`;
        if (cases.length !== 1 || typeof cases[0].state !== 'string') fail('CLARIFICATION_NOT_FOUND');
        const aggregateVersion = Number(cases[0].aggregate_version);
        if (!Number.isSafeInteger(aggregateVersion) || aggregateVersion < 0 || aggregateVersion >= 2_147_483_647) fail('CLARIFICATION_VERSION_CONFLICT');
        const versions = await tx`select coalesce(max(version), 0) as latest_version from osp_private.clarification_drafts where organization_id = ${input.organizationId} and case_id = ${input.draft.caseId}`;
        const latestVersion = versions.length === 1 ? Number(versions[0].latest_version) : Number.NaN;
        if (!Number.isSafeInteger(latestVersion) || latestVersion < 0 || latestVersion >= 2_147_483_647) fail('CLARIFICATION_PERSISTENCE_FAILED');
        const draftId = crypto.randomUUID();
        const version = latestVersion + 1;
        const body = input.draft.questions.map((question) => question.question).join('\n');
        const inserted = await tx`insert into osp_private.clarification_drafts (id, organization_id, case_id, body, attachment_ids, created_by_subject, version, status, questions_json, evidence_ids, canonical_sha256, authorization_mailbox) values (${draftId}, ${input.organizationId}, ${input.draft.caseId}, ${body}, ${[]}, 'osp-worker', ${version}, 'operations_review_required', ${JSON.stringify(input.draft.questions)}, ${input.draft.evidenceIds}, ${input.draft.canonicalSha256}, 'sales@heymarksman.com') returning id, case_id, version, status, questions_json, evidence_ids, canonical_sha256, authorization_mailbox`;
        if (inserted.length !== 1) fail('CLARIFICATION_PERSISTENCE_FAILED');
        const state = cases[0].state === 'analyzing_requirements' ? 'awaiting_clarification' : cases[0].state;
        const advanced = await tx`update osp_private.customer_registration_cases set aggregate_version = aggregate_version + 1, state = ${state}, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${input.draft.caseId} and aggregate_version = ${aggregateVersion} returning aggregate_version`;
        if (advanced.length !== 1 || Number(advanced[0].aggregate_version) !== aggregateVersion + 1) fail('CLARIFICATION_VERSION_CONFLICT');
        await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.draft.caseId}, ${aggregateVersion + 1}, ${state}, 'osp-worker', 'workflow', ${aggregateVersion}, statement_timestamp(), 'clarification_review_required', ${input.correlationId}, ${JSON.stringify(input.draft.evidenceIds)})`;
        return Object.freeze({
          id: draftId,
          caseId: input.draft.caseId,
          caseVersion: aggregateVersion + 1,
          version,
          status: 'operations_review_required' as const,
          questions: input.draft.questions,
          evidenceIds: input.draft.evidenceIds,
          canonicalSha256: input.draft.canonicalSha256,
          authorizationMailbox: 'sales@heymarksman.com' as const,
        });
      });
    },
    async listForReview(organizationId: string): Promise<readonly ClarificationReviewSummary[]> {
      return await withOrganizationTransaction(sql, organizationId, async (tx) => {
        const rows = await tx`select distinct on (draft.case_id) draft.id, draft.case_id, case_record.aggregate_version as case_version, draft.version, draft.status, draft.questions_json, draft.evidence_ids, draft.canonical_sha256, draft.authorization_mailbox from osp_private.clarification_drafts draft join osp_private.customer_registration_cases case_record on case_record.organization_id = draft.organization_id and case_record.id = draft.case_id where draft.organization_id = ${organizationId} and draft.status in ('operations_review_required', 'operations_reviewed') order by draft.case_id, draft.version desc limit 100`;
        return Object.freeze(rows.map(clarificationSummary));
      });
    },
    async saveOperationsReview(input: {
      organizationId: string;
      subject: string;
      draftId: string;
      expectedCaseVersion: number;
      expectedCanonicalSha256: string;
      questions: ClarificationDraft['questions'];
    }): Promise<ClarificationReviewSummary> {
      if (!UUID_PATTERN.test(input.organizationId) || !UUID_PATTERN.test(input.draftId) ||
          !Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 0 || input.expectedCaseVersion > 2_147_483_647 ||
          !/^[A-Za-z0-9:_-]{1,256}$/.test(input.subject) || !SHA256_PATTERN.test(input.expectedCanonicalSha256) || !Array.isArray(input.questions)) {
        fail('CLARIFICATION_REVIEW_REJECTED');
      }
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        const cases = await tx`select id, state, aggregate_version from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = (select case_id from osp_private.clarification_drafts where organization_id = ${input.organizationId} and id = ${input.draftId}) for update`;
        if (cases.length !== 1) fail('CLARIFICATION_NOT_FOUND');
        const aggregateVersion = Number(cases[0].aggregate_version);
        if (!Number.isSafeInteger(aggregateVersion) || aggregateVersion !== input.expectedCaseVersion || typeof cases[0].state !== 'string') fail('CLARIFICATION_VERSION_CONFLICT');
        const sources = await tx`select id, case_id, version, status, questions_json, evidence_ids, canonical_sha256, authorization_mailbox from osp_private.clarification_drafts where organization_id = ${input.organizationId} and id = ${input.draftId} and source_draft_id is null for update`;
        if (sources.length !== 1) fail('CLARIFICATION_NOT_FOUND');
        const row = sources[0];
        if (typeof row.case_id !== 'string' || typeof row.canonical_sha256 !== 'string' || row.status !== 'operations_review_required' || row.authorization_mailbox !== 'sales@heymarksman.com') fail('CLARIFICATION_REVIEW_REJECTED');
        const sourceVersion = Number(row.version);
        if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1 || sourceVersion >= 2_147_483_647) fail('CLARIFICATION_REVIEW_REJECTED');
        const source: ClarificationDraft = {
          caseId: row.case_id,
          status: 'operations_review_required',
          questions: clarificationQuestions(row.questions_json),
          evidenceIds: clarificationEvidence(row.evidence_ids),
          authorizationMailbox: 'sales@heymarksman.com',
          canonicalSha256: row.canonical_sha256,
        };
        const reviewed = await reviewClarificationDraft({ source, expectedCanonicalSha256: input.expectedCanonicalSha256, questions: input.questions });
        const draftId = crypto.randomUUID();
        const nextVersion = sourceVersion + 1;
        const body = reviewed.questions.map((question) => question.question).join('\n');
        const inserted = await tx`insert into osp_private.clarification_drafts (id, organization_id, case_id, body, attachment_ids, created_by_subject, version, status, questions_json, evidence_ids, canonical_sha256, authorization_mailbox, source_draft_id, reviewed_by_subject, reviewed_at) values (${draftId}, ${input.organizationId}, ${source.caseId}, ${body}, ${[]}, ${input.subject}, ${nextVersion}, 'operations_reviewed', ${JSON.stringify(reviewed.questions)}, ${reviewed.evidenceIds}, ${reviewed.canonicalSha256}, 'sales@heymarksman.com', ${input.draftId}, ${input.subject}, statement_timestamp()) returning id, case_id, version, status, questions_json, evidence_ids, canonical_sha256, authorization_mailbox`;
        if (inserted.length !== 1) fail('CLARIFICATION_PERSISTENCE_FAILED');
        const invalidatesAuthorization = cases[0].state === 'ready_to_send';
        const nextState = invalidatesAuthorization ? 'awaiting_clarification' : cases[0].state;
        if (invalidatesAuthorization) {
          const superseded = await tx`update osp_private.sales_authorizations set status = 'superseded' where organization_id = ${input.organizationId} and case_id = ${source.caseId} and status = 'authorized' returning id`;
          if (superseded.length !== 1) fail('CLARIFICATION_VERSION_CONFLICT');
        }
        const advanced = invalidatesAuthorization
          ? await tx`update osp_private.customer_registration_cases set state = ${nextState}, aggregate_version = aggregate_version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${source.caseId} and state = 'ready_to_send' and aggregate_version = ${input.expectedCaseVersion} returning aggregate_version`
          : await tx`update osp_private.customer_registration_cases set aggregate_version = aggregate_version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${source.caseId} and aggregate_version = ${input.expectedCaseVersion} returning aggregate_version`;
        if (advanced.length !== 1 || Number(advanced[0].aggregate_version) !== input.expectedCaseVersion + 1) fail('CLARIFICATION_VERSION_CONFLICT');
        if (invalidatesAuthorization) {
          await tx`insert into osp_private.approval_events (id, organization_id, case_id, case_version, event_type, actor_subject, actor_role, authorization_session_id, command_sha256, evidence_refs) values (${crypto.randomUUID()}, ${input.organizationId}, ${source.caseId}, ${input.expectedCaseVersion + 1}, ${'approval_invalidated'}, ${input.subject}, 'operations_reviewer', null, ${reviewed.canonicalSha256}, ${JSON.stringify(reviewed.evidenceIds)})`;
        }
        await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${source.caseId}, ${input.expectedCaseVersion + 1}, ${nextState}, ${input.subject}, 'operations', ${input.expectedCaseVersion}, statement_timestamp(), ${invalidatesAuthorization ? 'approval_invalidated' : 'clarification_operations_reviewed'}, ${crypto.randomUUID()}, ${JSON.stringify(reviewed.evidenceIds)})`;
        return Object.freeze({
          id: draftId,
          caseId: source.caseId,
          caseVersion: input.expectedCaseVersion + 1,
          version: nextVersion,
          status: 'operations_reviewed' as const,
          questions: reviewed.questions,
          evidenceIds: reviewed.evidenceIds,
          canonicalSha256: reviewed.canonicalSha256,
          authorizationMailbox: 'sales@heymarksman.com' as const,
        });
      });
    },
  });
}
