import postgres from 'npm:postgres@3.4.7';

import { withOrganizationTransaction, type SqlPort, type SqlRow } from '../_shared/osp/database-context.ts';
import type { DocumentApprovalInput, PersistedDocumentUpload } from './document-service.ts';

export type PostgresFactory = (databaseUrl: string, options: Record<string, unknown>) => unknown;
type Approval = DocumentApprovalInput & {
  organizationId: string;
  approvedBySubject: string;
  approvedByPermission: 'osp:operate';
};
export type DocumentVersionSummary = {
  id: string;
  documentType: string;
  version: number;
  status: string;
  validFrom: string;
  expiresAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;

function databaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (value.trim() !== value || !['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash) throw new Error('INVALID_RUNTIME_CONFIGURATION');
    return value;
  } catch { throw new Error('INVALID_RUNTIME_CONFIGURATION'); }
}

function one(rows: SqlRow[], code: string): SqlRow {
  if (rows.length !== 1) throw new Error(code);
  return rows[0];
}

function integer(value: unknown, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) throw new Error(code);
  return parsed;
}

export function createPostgresDocumentStore(options: { databaseUrl: string; postgresFactory?: PostgresFactory }) {
  const created = (options.postgresFactory ?? postgres as unknown as PostgresFactory)(databaseUrl(options.databaseUrl), {
    ssl: 'verify-full', fetch_types: false, prepare: false, max: 1, connect_timeout: 5,
    connection: { application_name: 'osp-document-api', statement_timeout: '5000' },
  });
  if (typeof created !== 'function') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const sql = created as SqlPort;

  return Object.freeze({
    async listVersions(organizationId: string): Promise<readonly DocumentVersionSummary[]> {
      return await withOrganizationTransaction(sql, organizationId, async (tx) => {
        const rows = await tx`select version.id, version.document_type, version.version, version.status, version.valid_from::text as valid_from, version.expires_at::text as expires_at from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where version.organization_id = ${organizationId} and document.case_id is null and version.document_type in ('proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement') order by version.document_type asc, version.version desc`;
        return Object.freeze(rows.map((row) => {
          if (typeof row.id !== 'string' || !UUID.test(row.id) || typeof row.document_type !== 'string' || typeof row.status !== 'string' || typeof row.valid_from !== 'string' || typeof row.expires_at !== 'string') throw new Error('DOCUMENT_PERSISTENCE_FAILED');
          return Object.freeze({ id: row.id, documentType: row.document_type, version: integer(row.version, 'DOCUMENT_PERSISTENCE_FAILED'), status: row.status, validFrom: row.valid_from, expiresAt: row.expires_at });
        }));
      });
    },
    async createVersion(input: PersistedDocumentUpload): Promise<{ id: string; version: number }> {
      const {
        organizationId, documentType, contentType, validFrom, expiresAt, uploadedBySubject,
        bucketId, opaqueObjectKey, sizeBytes, sourceSha256, malwareStatus, status,
      } = input;
      if (!UUID.test(organizationId) || !SHA.test(sourceSha256) || malwareStatus !== 'clean' || status !== 'uploaded' || sizeBytes < 1) throw new Error('DOCUMENT_PERSISTENCE_FAILED');
      return await withOrganizationTransaction(sql, organizationId, async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${organizationId} || ':' || ${documentType}, 0))`;
        const existing = await tx`select document.id, document.version as aggregate_version, version.id as latest_version_id, version.version as latest_version from osp_private.documents document join osp_private.document_versions version on version.organization_id = document.organization_id and version.document_id = document.id where document.organization_id = ${organizationId} and document.case_id is null and version.document_type = ${documentType} order by version.version desc limit 1 for update of document`;
        let documentId: string;
        let aggregateVersion: number;
        let latestVersionId: string | null;
        let nextVersion: number;
        if (existing.length === 0) {
          documentId = crypto.randomUUID();
          const createdDocument = one(await tx`insert into osp_private.documents (id, organization_id, case_id, version) values (${documentId}, ${organizationId}, null, 0) returning id, version`, 'DOCUMENT_PERSISTENCE_FAILED');
          aggregateVersion = integer(createdDocument.version, 'DOCUMENT_PERSISTENCE_FAILED');
          latestVersionId = null;
          nextVersion = 1;
        } else {
          const row = one(existing, 'DOCUMENT_PERSISTENCE_FAILED');
          if (typeof row.id !== 'string' || !UUID.test(row.id) || typeof row.latest_version_id !== 'string' || !UUID.test(row.latest_version_id)) throw new Error('DOCUMENT_PERSISTENCE_FAILED');
          documentId = row.id;
          aggregateVersion = integer(row.aggregate_version, 'DOCUMENT_PERSISTENCE_FAILED');
          latestVersionId = row.latest_version_id;
          nextVersion = integer(row.latest_version, 'DOCUMENT_PERSISTENCE_FAILED') + 1;
        }
        const versionId = crypto.randomUUID();
        const inserted = one(await tx`insert into osp_private.document_versions (id, organization_id, document_id, version, document_type, status, source_sha256, bucket_id, opaque_object_key, content_type, valid_from, expires_at, uploaded_by_subject, review_before_sha256, review_after_sha256, supersedes_version_id) values (${versionId}, ${organizationId}, ${documentId}, ${nextVersion}, ${documentType}, 'uploaded', ${sourceSha256}, ${bucketId}, ${opaqueObjectKey}, ${contentType}, ${validFrom}, ${expiresAt}, ${uploadedBySubject}, ${sourceSha256}, ${sourceSha256}, ${latestVersionId}) returning id, version`, 'DOCUMENT_PERSISTENCE_FAILED');
        const assessmentId = crypto.randomUUID();
        await tx`insert into osp_private.source_safety_assessments (id, organization_id, document_version_id, version, status, content_sha256, reason_code, assessed_at) values (${assessmentId}, ${organizationId}, ${versionId}, 1, 'safe', ${sourceSha256}, 'managed_malware_scan_clean', statement_timestamp())`;
        one(await tx`select id, status from osp_private.mark_document_review_required_command(${organizationId}, ${versionId})`, 'DOCUMENT_PERSISTENCE_FAILED');
        const advanced = await tx`update osp_private.documents set version = version + 1, updated_at = statement_timestamp() where organization_id = ${organizationId} and id = ${documentId} and version = ${aggregateVersion} returning version`;
        one(advanced, 'DOCUMENT_VERSION_CONFLICT');
        if (inserted.id !== versionId || integer(inserted.version, 'DOCUMENT_PERSISTENCE_FAILED') !== nextVersion) throw new Error('DOCUMENT_PERSISTENCE_FAILED');
        return Object.freeze({ id: versionId, version: nextVersion });
      });
    },

    async approveVersion(input: Approval): Promise<{ id: string; status: 'approved' }> {
      const {
        organizationId, versionId, expectedVersion, reviewBeforeSha256, reviewAfterSha256,
        approvedBySubject, approvedByPermission,
      } = input;
      if (!UUID.test(organizationId) || !UUID.test(versionId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
          !SHA.test(reviewBeforeSha256) || reviewBeforeSha256 !== reviewAfterSha256 || approvedByPermission !== 'osp:operate') {
        throw new Error('DOCUMENT_APPROVAL_REJECTED');
      }
      return await withOrganizationTransaction(sql, organizationId, async (tx) => {
        const row = one(await tx`select version.id, version.document_id, version.version, version.status, version.source_sha256, document.version as aggregate_version from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where version.organization_id = ${organizationId} and version.id = ${versionId} for update of version, document`, 'DOCUMENT_NOT_FOUND');
        const persistedVersion = integer(row.version, 'DOCUMENT_APPROVAL_REJECTED');
        if (persistedVersion !== expectedVersion || row.status !== 'review_required') throw new Error('DOCUMENT_VERSION_CONFLICT');
        if (row.source_sha256 !== reviewBeforeSha256 || row.source_sha256 !== reviewAfterSha256) throw new Error('DOCUMENT_REVIEW_HASH_MISMATCH');
        if (typeof row.document_id !== 'string' || !UUID.test(row.document_id)) throw new Error('DOCUMENT_APPROVAL_REJECTED');
        const documentId = row.document_id;
        const aggregateVersion = integer(row.aggregate_version, 'DOCUMENT_APPROVAL_REJECTED');
        const approved = one(await tx`select id, status from osp_private.approve_document_version_command(${organizationId}, ${versionId}, ${expectedVersion}, ${reviewBeforeSha256}, ${reviewAfterSha256}, ${approvedBySubject}, ${approvedByPermission})`, 'DOCUMENT_VERSION_CONFLICT');
        const advanced = await tx`update osp_private.documents set version = version + 1, updated_at = statement_timestamp() where organization_id = ${organizationId} and id = ${documentId} and version = ${aggregateVersion} returning version`;
        one(advanced, 'DOCUMENT_VERSION_CONFLICT');
        if (approved.id !== versionId || approved.status !== 'approved') throw new Error('DOCUMENT_APPROVAL_REJECTED');
        return Object.freeze({ id: versionId, status: 'approved' as const });
      });
    },
  });
}
