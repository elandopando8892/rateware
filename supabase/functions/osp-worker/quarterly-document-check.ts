export const QUARTERLY_DOCUMENT_TYPES = Object.freeze([
  'proof_of_address',
  'sat_compliance_opinion',
  'tax_status_certificate',
  'bank_statement',
] as const);

export type QuarterlyDocumentType = typeof QUARTERLY_DOCUMENT_TYPES[number];
export type QuarterlyDocumentVersion = {
  id: string;
  documentType: string;
  version: number;
  status: string;
  validFrom: string;
  expiresAt: string;
};
export type QuarterlyAssessment = {
  blocked: boolean;
  referenceDate: string;
  currentVersionIds: readonly string[];
  missingTypes: readonly QuarterlyDocumentType[];
  expiringTypes: readonly QuarterlyDocumentType[];
  noticeKeys: readonly string[];
  notices: readonly { versionId: string; documentType: QuarterlyDocumentType; boundaryDays: 30 | 14 | 7 | 0 }[];
};

const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ID = /^[A-Za-z0-9:_-]{1,256}$/;

function date(value: unknown): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new Error('QUARTERLY_DOCUMENT_INVALID');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('QUARTERLY_DOCUMENT_INVALID');
  return value;
}

function daysBetween(left: string, right: string): number {
  return (Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) / 86_400_000;
}

export function assessQuarterlyDocuments(input: { referenceDate: string; versions: readonly QuarterlyDocumentVersion[] }): QuarterlyAssessment {
  const referenceDate = date(input.referenceDate);
  if (!Array.isArray(input.versions) || input.versions.length > 10_000) throw new Error('QUARTERLY_DOCUMENT_INVALID');
  const byType = new Map<QuarterlyDocumentType, QuarterlyDocumentVersion[]>();
  for (const type of QUARTERLY_DOCUMENT_TYPES) byType.set(type, []);
  const identities = new Set<string>();
  for (const raw of input.versions) {
    if (!raw || typeof raw !== 'object' || !QUARTERLY_DOCUMENT_TYPES.includes(raw.documentType as QuarterlyDocumentType) ||
        !ID.test(raw.id) || !Number.isSafeInteger(raw.version) || raw.version < 1 || raw.version > 2_147_483_647) {
      throw new Error('QUARTERLY_DOCUMENT_INVALID');
    }
    const validFrom = date(raw.validFrom);
    const expiresAt = date(raw.expiresAt);
    if (validFrom >= expiresAt) throw new Error('QUARTERLY_DOCUMENT_INVALID');
    const identity = `${raw.documentType}:${raw.version}`;
    if (identities.has(identity)) throw new Error('QUARTERLY_DOCUMENT_AMBIGUOUS');
    identities.add(identity);
    byType.get(raw.documentType as QuarterlyDocumentType)!.push({ ...raw, validFrom, expiresAt });
  }
  const currentVersionIds: string[] = [];
  const missingTypes: QuarterlyDocumentType[] = [];
  const expiringTypes: QuarterlyDocumentType[] = [];
  const noticeKeys: string[] = [];
  const notices: { versionId: string; documentType: QuarterlyDocumentType; boundaryDays: 30 | 14 | 7 | 0 }[] = [];
  for (const type of QUARTERLY_DOCUMENT_TYPES) {
    const eligible = byType.get(type)!
      .filter((version) => version.status === 'approved' && version.validFrom <= referenceDate && referenceDate < version.expiresAt)
      .sort((left, right) => right.version - left.version);
    const selected = eligible[0];
    if (!selected) {
      missingTypes.push(type);
      continue;
    }
    currentVersionIds.push(selected.id);
    const remainingDays = daysBetween(referenceDate, selected.expiresAt);
    if (remainingDays >= 0 && remainingDays <= 30) {
      expiringTypes.push(type);
      for (const boundaryDays of [30, 14, 7, 0] as const) {
        if (remainingDays <= boundaryDays) notices.push({ versionId: selected.id, documentType: type, boundaryDays });
      }
    }
  }
  notices.sort((left, right) => left.documentType.localeCompare(right.documentType) || left.boundaryDays - right.boundaryDays);
  noticeKeys.push(...notices.map((notice) => `quarterly:${notice.documentType}:${notice.versionId}:${notice.boundaryDays}`));
  return Object.freeze({
    blocked: missingTypes.length > 0,
    referenceDate,
    currentVersionIds: Object.freeze(currentVersionIds),
    missingTypes: Object.freeze([...missingTypes].sort()),
    expiringTypes: Object.freeze([...expiringTypes].sort()),
    noticeKeys: Object.freeze([...noticeKeys].sort()),
    notices: Object.freeze(notices.map((notice) => Object.freeze(notice))),
  });
}

export interface QuarterlyDocumentService {
  check(input: { organizationId: string; referenceDate: Date; correlationId: string }): Promise<QuarterlyAssessment>;
}

export function createQuarterlyDocumentService(deps: {
  loadVersions(organizationId: string): Promise<readonly QuarterlyDocumentVersion[]>;
  persistAssessment(input: QuarterlyAssessment & { organizationId: string; correlationId: string }): Promise<void>;
}): QuarterlyDocumentService {
  return Object.freeze({
    async check(input: { organizationId: string; referenceDate: Date; correlationId: string }) {
      if (!ID.test(input.organizationId) || !ID.test(input.correlationId) || !(input.referenceDate instanceof Date) || Number.isNaN(input.referenceDate.getTime())) throw new Error('QUARTERLY_DOCUMENT_INVALID');
      const assessment = assessQuarterlyDocuments({ referenceDate: input.referenceDate.toISOString().slice(0, 10), versions: await deps.loadVersions(input.organizationId) });
      await deps.persistAssessment({ ...assessment, organizationId: input.organizationId, correlationId: input.correlationId });
      return assessment;
    },
  });
}
