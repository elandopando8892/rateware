import postgres from 'npm:postgres@3.4.7';

import { withOrganizationTransaction, type SqlPort, type SqlRow } from '../_shared/osp/database-context.ts';
import { createQuarterlyDocumentService, type QuarterlyAssessment, type QuarterlyDocumentService, type QuarterlyDocumentVersion } from './quarterly-document-check.ts';

type PostgresFactory = (databaseUrl: string, options: Record<string, unknown>) => unknown;

function databaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (value.trim() !== value || !['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash) throw new Error('INVALID_RUNTIME_CONFIGURATION');
    return value;
  } catch { throw new Error('INVALID_RUNTIME_CONFIGURATION'); }
}

function version(row: SqlRow): QuarterlyDocumentVersion {
  if (typeof row.id !== 'string' || typeof row.document_type !== 'string' || !Number.isSafeInteger(Number(row.version)) ||
      typeof row.status !== 'string' || typeof row.valid_from !== 'string' || typeof row.expires_at !== 'string') throw new Error('DATABASE_TEMPORARY');
  return Object.freeze({ id: row.id, documentType: row.document_type, version: Number(row.version), status: row.status, validFrom: row.valid_from, expiresAt: row.expires_at });
}

export function createPostgresQuarterlyDocumentService(options: { databaseUrl: string; postgresFactory?: PostgresFactory }): QuarterlyDocumentService {
  const created = (options.postgresFactory ?? postgres as unknown as PostgresFactory)(databaseUrl(options.databaseUrl), {
    ssl: 'verify-full', fetch_types: false, prepare: false, max: 1, connect_timeout: 5,
    connection: { application_name: 'osp-quarterly-document-check', statement_timeout: '3000' },
  });
  if (typeof created !== 'function') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const sql = created as SqlPort;
  return createQuarterlyDocumentService({
    async loadVersions(organizationId) {
      return await withOrganizationTransaction(sql, organizationId, async (tx) => {
        const rows = await tx`select version.id, version.document_type, version.version, version.status, version.valid_from::text as valid_from, version.expires_at::text as expires_at from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where document.organization_id = ${organizationId} and document.case_id is null and version.document_type in ('proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement') order by version.document_type asc, version.version asc`;
        return rows.map(version);
      });
    },
    async persistAssessment(input: QuarterlyAssessment & { organizationId: string; correlationId: string }) {
      await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        for (const notice of input.notices) {
          const id = crypto.randomUUID();
          const organizationId = input.organizationId;
          const versionId = notice.versionId;
          const boundaryDays = notice.boundaryDays;
          await tx`insert into osp_private.document_renewal_alerts (id, organization_id, document_version_id, boundary_days, version, status) values (${id}, ${organizationId}, ${versionId}, ${boundaryDays}, 0, 'pending') on conflict (organization_id, document_version_id, boundary_days) do nothing`;
        }
      });
    },
  });
}
