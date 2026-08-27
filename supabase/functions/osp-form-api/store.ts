import type { FormComponent, FormTemplateVersion } from '../../../apps/osp/src/features/forms/surveyjs-canonical-adapter.ts';
import { assessFormCompletion } from '../../../apps/osp/src/features/forms/form-completion.ts';

export type FormTemplateCatalogItem = {
  templateId: string;
  name: string;
  updatedAt: string;
  latest: FormTemplateVersion;
};

export type SaveFormDraftInput = {
  organizationId: string;
  subject: string;
  idempotencyKey: string;
  templateId: string | null;
  expectedVersion: number;
  name: string;
  fields: readonly FormComponent[];
  schemaSha256: string;
};

export type PublishFormInput = {
  organizationId: string;
  subject: string;
  idempotencyKey: string;
  templateId: string;
  templateVersionId: string;
  expectedVersion: number;
};

export type FormMutationReceipt = { template: FormTemplateCatalogItem; replayed: boolean };

export type CaseFormInstance = { id: string; version: number; values: Record<string, unknown>; updatedAt: string };
export type CaseFormMappingFieldReview = {
  fieldId: string;
  source: 'existing_draft' | 'rateware' | 'attachment' | 'missing';
  status: 'prepared' | 'missing' | 'contradictory';
  evidenceCount: number;
};
export type CaseFormProtectedFieldReview = {
  id: string;
  fieldKey: string;
  presence: 'present' | 'blank' | 'absent' | 'uncertain';
  value: string | number | boolean | null;
  confidence: number;
  validation: 'valid' | 'low_confidence' | 'contradictory' | 'invalid';
  evidenceCount: number;
  reviewed: boolean;
};
export type CaseFormEvidenceReview = {
  sourceDocumentVersionId: string;
  sourceDocumentVersion: number;
  sourceDocumentStatus: 'uploaded' | 'analyzing' | 'review_required' | 'approved' | 'rejected' | 'superseded';
  sourceDocumentFingerprint: string;
  extractionId: string;
  extractionStatus: 'review_required' | 'reviewed' | 'failed';
  totalFieldCount: number;
  invalidFieldCount: number;
  protectedFields: readonly CaseFormProtectedFieldReview[];
};
export type CaseFormMappingReview = {
  id: string;
  version: number;
  status: 'unresolved' | 'accepted' | 'corrected' | 'rejected';
  automaticStatus: 'ready_for_operations_review' | 'awaiting_xbf_information' | 'awaiting_clarification';
  afterSha256: string;
  matchesCurrentDraft: boolean;
  fields: readonly CaseFormMappingFieldReview[];
  evidence: CaseFormEvidenceReview;
  updatedAt: string;
};
export type CaseFormWorkspaceRecord = {
  caseId: string;
  supplierName: string;
  caseVersion: number;
  caseState: string;
  templateName: string | null;
  template: FormTemplateVersion | null;
  instance: CaseFormInstance | null;
  mappings: readonly CaseFormMappingReview[];
  evidenceReady: boolean;
  saveDraftAllowed: boolean;
  acceptMappingAllowed: boolean;
  submitForReviewAllowed: boolean;
};
export type SaveCaseFormDraftInput = {
  organizationId: string;
  subject: string;
  idempotencyKey: string;
  caseId: string;
  templateVersionId: string;
  instanceId: string | null;
  expectedVersion: number;
  values: Record<string, unknown>;
};
export type CaseFormMutationReceipt = { instance: CaseFormInstance; replayed: boolean };
export type AcceptCaseFormMappingInput = {
  organizationId: string;
  subject: string;
  idempotencyKey: string;
  caseId: string;
  mappingId: string;
  expectedMappingVersion: number;
  expectedAfterSha256: string;
};
export type CaseFormMappingReviewReceipt = {
  mappingId: string;
  mappingVersion: number;
  status: 'accepted';
  reviewDecisionId: string;
  documentVersionId: string;
  extractionId: string;
  reviewedFieldCount: number;
  replayed: boolean;
};
export type SubmitCaseFormForReviewInput = SaveCaseFormDraftInput & { expectedCaseVersion: number };
export type CaseFormSubmissionReceipt = {
  instance: CaseFormInstance;
  caseState: 'operations_review';
  caseVersion: number;
  snapshotSha256: string;
  replayed: boolean;
};

export interface FormStore {
  list(organizationId: string): Promise<readonly FormTemplateCatalogItem[]>;
  saveDraft(input: SaveFormDraftInput): Promise<FormMutationReceipt>;
  publish(input: PublishFormInput): Promise<FormMutationReceipt>;
  getCaseFormWorkspace(organizationId: string, caseId: string): Promise<CaseFormWorkspaceRecord>;
  saveCaseFormDraft(input: SaveCaseFormDraftInput): Promise<CaseFormMutationReceipt>;
  acceptCaseFormMapping(input: AcceptCaseFormMappingInput): Promise<CaseFormMappingReviewReceipt>;
  submitCaseFormForReview(input: SubmitCaseFormForReviewInput): Promise<CaseFormSubmissionReceipt>;
}

type ReceiptValue = FormMutationReceipt | CaseFormMutationReceipt | CaseFormMappingReviewReceipt | CaseFormSubmissionReceipt;
type Receipt = { hash: string; value: ReceiptValue };
type SeedCase = { organizationId: string; caseId: string; supplierName: string; caseVersion: number; caseState: string };

function fail(code: string): never { throw new Error(code); }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function locked<T>(lock: { current: Promise<void> }, action: () => Promise<T>): Promise<T> {
  const previous = lock.current;
  let release!: () => void;
  lock.current = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await action(); } finally { release(); }
}

export function createInMemoryFormStore(now: () => Date = () => new Date('2026-08-26T20:00:00.000Z'), seedCases: readonly SeedCase[] = []): FormStore {
  const byOrganization = new Map<string, Map<string, FormTemplateCatalogItem>>();
  const cases = new Map(seedCases.map((item) => [`${item.organizationId}\u0000${item.caseId}`, structuredClone(item)]));
  const caseInstances = new Map<string, CaseFormInstance>();
  const receipts = new Map<string, Receipt>();
  const lock = { current: Promise.resolve() };
  const templates = (organizationId: string) => {
    let organization = byOrganization.get(organizationId);
    if (!organization) { organization = new Map(); byOrganization.set(organizationId, organization); }
    return organization;
  };
  const receiptKey = (organizationId: string, operation: string, idempotencyKey: string) => `${organizationId}\u0000${operation}\u0000${idempotencyKey}`;

  async function replayOrRun<T extends ReceiptValue>(input: { organizationId: string; idempotencyKey: string }, operation: string, request: unknown, action: () => T | Promise<T>): Promise<T> {
    return await locked(lock, async () => {
      const key = receiptKey(input.organizationId, operation, input.idempotencyKey);
      const requestHash = await hash(request);
      const prior = receipts.get(key);
      if (prior) {
        if (prior.hash !== requestHash) fail('IDEMPOTENCY_CONFLICT');
        return structuredClone({ ...prior.value, replayed: true }) as T;
      }
      const value = await action();
      receipts.set(key, { hash: requestHash, value: structuredClone(value) });
      return structuredClone(value) as T;
    });
  }

  function writeCaseInstance(input: SaveCaseFormDraftInput): CaseFormInstance {
    const registrationCase = cases.get(`${input.organizationId}\u0000${input.caseId}`);
    if (!registrationCase) fail('CASE_NOT_FOUND');
    if (!['awaiting_xbf_information', 'preparing'].includes(registrationCase.caseState)) fail('CASE_FORM_LOCKED');
    const template = [...templates(input.organizationId).values()].find((item) => item.latest.id === input.templateVersionId && item.latest.status === 'published');
    if (!template) fail('FORM_NOT_FOUND');
    const allowedFields = new Set(template.latest.fields.map((field) => field.id));
    if (Object.keys(input.values).some((key) => !allowedFields.has(key))) fail('FORM_SCHEMA_INVALID');
    const key = `${input.organizationId}\u0000${input.caseId}\u0000${input.templateVersionId}`;
    const current = caseInstances.get(key) ?? null;
    if (input.instanceId === null) {
      if (current || input.expectedVersion !== 0) fail('VERSION_CONFLICT');
    } else if (!current || current.id !== input.instanceId || current.version !== input.expectedVersion) fail('VERSION_CONFLICT');
    const instance = current && stable(current.values) === stable(input.values)
      ? current
      : { id: current?.id ?? crypto.randomUUID(), version: (current?.version ?? 0) + 1, values: structuredClone(input.values), updatedAt: now().toISOString() };
    caseInstances.set(key, instance);
    return structuredClone(instance);
  }

  return Object.freeze({
    async list(organizationId: string) {
      return [...templates(organizationId).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => structuredClone(item));
    },
    async saveDraft(input: SaveFormDraftInput) {
      return await replayOrRun(input, 'save_form_template_draft', input, () => {
        const organization = templates(input.organizationId);
        const current = input.templateId === null ? null : organization.get(input.templateId) ?? null;
        if (input.templateId === null) {
          if (input.expectedVersion !== 0) fail('VERSION_CONFLICT');
          if ([...organization.values()].some((item) => item.name === input.name)) fail('FORM_NAME_CONFLICT');
        } else if (!current) fail('FORM_NOT_FOUND');
        else if (current.latest.version !== input.expectedVersion || current.name !== input.name) fail('VERSION_CONFLICT');
        const templateId = current?.templateId ?? crypto.randomUUID();
        const version = (current?.latest.version ?? 0) + 1;
        const item: FormTemplateCatalogItem = {
          templateId, name: input.name, updatedAt: now().toISOString(),
          latest: { id: crypto.randomUUID(), templateId, version, status: 'draft', fields: structuredClone(input.fields), schemaSha256: input.schemaSha256 },
        };
        organization.set(templateId, item);
        return { template: item, replayed: false };
      });
    },
    async publish(input: PublishFormInput) {
      return await replayOrRun(input, 'publish_form_template', input, () => {
        const item = templates(input.organizationId).get(input.templateId);
        if (!item) fail('FORM_NOT_FOUND');
        if (item.latest.id !== input.templateVersionId || item.latest.version !== input.expectedVersion || item.latest.status !== 'draft') fail('VERSION_CONFLICT');
        item.latest = { ...item.latest, status: 'published' };
        item.updatedAt = now().toISOString();
        return { template: item, replayed: false };
      });
    },
    async getCaseFormWorkspace(organizationId: string, caseId: string) {
      const registrationCase = cases.get(`${organizationId}\u0000${caseId}`);
      if (!registrationCase) fail('CASE_NOT_FOUND');
      const published = [...templates(organizationId).values()].filter((item) => item.latest.status === 'published').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
      const instance = published ? caseInstances.get(`${organizationId}\u0000${caseId}\u0000${published.latest.id}`) ?? null : null;
      return structuredClone({
        caseId, supplierName: registrationCase.supplierName, caseVersion: registrationCase.caseVersion, caseState: registrationCase.caseState,
        templateName: published?.name ?? null, template: published?.latest ?? null, instance,
        mappings: [],
        evidenceReady: true,
        saveDraftAllowed: ['awaiting_xbf_information', 'preparing'].includes(registrationCase.caseState),
        acceptMappingAllowed: false,
        submitForReviewAllowed: registrationCase.caseState === 'preparing',
      });
    },
    async saveCaseFormDraft(input: SaveCaseFormDraftInput) {
      return await replayOrRun(input, 'save_case_form_draft', input, () => ({ instance: writeCaseInstance(input), replayed: false }));
    },
    async acceptCaseFormMapping(input: AcceptCaseFormMappingInput) {
      return await replayOrRun(input, 'accept_case_form_mapping', input, () => fail('FORM_MAPPING_NOT_FOUND'));
    },
    async submitCaseFormForReview(input: SubmitCaseFormForReviewInput) {
      return await replayOrRun(input, 'submit_case_form_for_review', input, async () => {
        const registrationCase = cases.get(`${input.organizationId}\u0000${input.caseId}`);
        if (!registrationCase) fail('CASE_NOT_FOUND');
        if (registrationCase.caseState !== 'preparing') fail('CASE_FORM_LOCKED');
        if (registrationCase.caseVersion !== input.expectedCaseVersion) fail('VERSION_CONFLICT');
        const template = [...templates(input.organizationId).values()].find((item) => item.latest.id === input.templateVersionId && item.latest.status === 'published');
        if (!template) fail('FORM_NOT_FOUND');
        if (!assessFormCompletion(template.latest, input.values).ready) fail('FORM_INCOMPLETE');
        const instance = writeCaseInstance(input);
        registrationCase.caseState = 'operations_review';
        registrationCase.caseVersion += 1;
        const snapshotSha256 = await hash({ organizationId: input.organizationId, caseId: input.caseId, caseVersion: registrationCase.caseVersion, templateVersionId: input.templateVersionId, instanceId: instance.id, instanceVersion: instance.version });
        return { instance, caseState: 'operations_review', caseVersion: registrationCase.caseVersion, snapshotSha256, replayed: false };
      });
    },
  });
}

export const formStoreInternals = Object.freeze({ stable, hash });
