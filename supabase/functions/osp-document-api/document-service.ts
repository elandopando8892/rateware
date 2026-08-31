export const CORPORATE_DOCUMENT_TYPES = Object.freeze([
  'proof_of_address',
  'sat_compliance_opinion',
  'tax_status_certificate',
  'bank_statement',
] as const);
export type CorporateDocumentType = typeof CORPORATE_DOCUMENT_TYPES[number];

export type DocumentAuthority = { organizationId: string; subject: string; permissions: readonly string[] };
export type DocumentUploadInput = {
  documentType: CorporateDocumentType;
  contentType: string;
  bytes: Uint8Array;
  validFrom: string;
};
export type PersistedDocumentUpload = Omit<DocumentUploadInput, 'bytes'> & {
  organizationId: string;
  uploadedBySubject: string;
  bucketId: 'osp-corporate-documents';
  opaqueObjectKey: string;
  sizeBytes: number;
  sourceSha256: string;
  malwareStatus: 'clean';
  expiresAt: string;
  status: 'uploaded';
};
export type DocumentApprovalInput = { versionId: string; expectedVersion: number; reviewBeforeSha256: string; reviewAfterSha256: string };

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const SHA = /^[0-9a-f]{64}$/;
const SAFE = /^[A-Za-z0-9:_@.-]{1,256}$/;
const CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

function assertAuthority(authority: DocumentAuthority, required: 'read' | 'operate'): void {
  const permitted = required === 'operate'
    ? authority.permissions.some((permission) => permission === 'osp:operate' || permission === 'osp:superuser')
    : authority.permissions.some((permission) => permission === 'osp:read' || permission === 'osp:operate' || permission === 'osp:superuser');
  if (!SAFE.test(authority.organizationId) || !SAFE.test(authority.subject) || !permitted) throw new Error('FORBIDDEN');
}

function calendarExpiry(value: string): string {
  if (!DATE.test(value)) throw new Error('DOCUMENT_UPLOAD_REJECTED');
  const source = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(source.getTime()) || source.toISOString().slice(0, 10) !== value) throw new Error('DOCUMENT_UPLOAD_REJECTED');
  const targetMonth = source.getUTCMonth() + 3;
  const targetYear = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(source.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

function upload(input: unknown): DocumentUploadInput & { expiresAt: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('DOCUMENT_UPLOAD_REJECTED');
  const record = input as Record<string, unknown>;
  const keys = ['bytes', 'contentType', 'documentType', 'validFrom'];
  if (Object.keys(record).sort().join('\u0000') !== keys.sort().join('\u0000') || !CORPORATE_DOCUMENT_TYPES.includes(record.documentType as CorporateDocumentType) ||
      typeof record.contentType !== 'string' || !CONTENT_TYPES.has(record.contentType) || !(record.bytes instanceof Uint8Array) || record.bytes.byteLength < 1 || record.bytes.byteLength > 26_214_400 ||
      typeof record.validFrom !== 'string') throw new Error('DOCUMENT_UPLOAD_REJECTED');
  return { ...(record as DocumentUploadInput), expiresAt: calendarExpiry(record.validFrom) };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createDocumentService(deps: {
  scan(input: { sourceUrl: string; sourceSha256: string; sizeBytes: number }): Promise<'clean' | 'infected' | 'unknown'>;
  putPrivateObject(input: { bucketId: 'osp-corporate-documents'; opaqueObjectKey: string; bytes: Uint8Array; contentType: string; sourceSha256: string }): Promise<void>;
  createPrivateReadUrl(input: { bucketId: 'osp-corporate-documents'; opaqueObjectKey: string; expiresInSeconds: number }): Promise<string>;
  deletePrivateObject(input: { bucketId: 'osp-corporate-documents'; opaqueObjectKey: string }): Promise<void>;
  createVersion(input: PersistedDocumentUpload): Promise<{ id: string; version: number }>;
  approveVersion?(input: DocumentApprovalInput & { organizationId: string; approvedBySubject: string; approvedByPermission: 'osp:operate' }): Promise<{ id: string; status: 'approved' }>;
}) {
  return Object.freeze({
    async upload(authority: DocumentAuthority, input: DocumentUploadInput) {
      assertAuthority(authority, 'read');
      const validated = upload(input);
      const sourceBytes = validated.bytes.slice();
      const sourceSha256 = await sha256(sourceBytes);
      const opaqueObjectKey = `${crypto.randomUUID()}/${crypto.randomUUID()}`;
      await deps.putPrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey, bytes: sourceBytes.slice(), contentType: validated.contentType, sourceSha256 });
      try {
        const sourceUrl = await deps.createPrivateReadUrl({ bucketId: 'osp-corporate-documents', opaqueObjectKey, expiresInSeconds: 60 });
        if (await deps.scan({ sourceUrl, sourceSha256, sizeBytes: sourceBytes.byteLength }) !== 'clean') throw new Error('DOCUMENT_UPLOAD_REJECTED');
      } catch (error) {
        try { await deps.deletePrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey }); } catch { /* orphan cleanup is retried operationally */ }
        throw error;
      }
      let result: { id: string; version: number };
      try {
        result = await deps.createVersion({
          documentType: validated.documentType,
          contentType: validated.contentType,
          validFrom: validated.validFrom,
          expiresAt: validated.expiresAt,
          sizeBytes: sourceBytes.byteLength,
          sourceSha256,
          malwareStatus: 'clean',
          organizationId: authority.organizationId,
          uploadedBySubject: authority.subject,
          bucketId: 'osp-corporate-documents',
          opaqueObjectKey,
          status: 'uploaded',
        });
      } catch {
        try { await deps.deletePrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey }); } catch { /* orphan cleanup is retried operationally */ }
        throw new Error('DOCUMENT_PERSISTENCE_FAILED');
      }
      return Object.freeze({ ...result, expiresAt: validated.expiresAt });
    },
    async approve(authority: DocumentAuthority, input: DocumentApprovalInput) {
      assertAuthority(authority, 'operate');
      if (!deps.approveVersion || !SAFE.test(input.versionId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !SHA.test(input.reviewBeforeSha256) || input.reviewBeforeSha256 !== input.reviewAfterSha256) throw new Error(input.reviewBeforeSha256 !== input.reviewAfterSha256 ? 'DOCUMENT_REVIEW_HASH_MISMATCH' : 'DOCUMENT_APPROVAL_REJECTED');
      return await deps.approveVersion({ ...input, organizationId: authority.organizationId, approvedBySubject: authority.subject, approvedByPermission: 'osp:operate' });
    },
  });
}
