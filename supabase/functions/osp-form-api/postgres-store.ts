import postgres from 'npm:postgres@3.4.7';

import type { FormComponent, FormTemplateVersion } from '../../../apps/osp/src/features/forms/surveyjs-canonical-adapter.ts';
import { assessFormCompletion } from '../../../apps/osp/src/features/forms/form-completion.ts';
import { withOrganizationTransaction, type SqlPort, type SqlRow } from '../_shared/osp/database-context.ts';
import { formStoreInternals, type AcceptCaseFormMappingInput, type CaseFormInstance, type CaseFormMappingReview, type CaseFormMappingReviewReceipt, type CaseFormMutationReceipt, type CaseFormSubmissionReceipt, type CaseFormWorkspaceRecord, type FormMutationReceipt, type FormStore, type FormTemplateCatalogItem, type PublishFormInput, type SaveCaseFormDraftInput, type SaveFormDraftInput, type SubmitCaseFormForReviewInput } from './store.ts';

type PostgresFactory = (databaseUrl: string, options: Record<string, unknown>) => unknown;

function fail(code: string): never { throw new Error(code); }

function databaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get('sslmode');
    const allowedQuery = parsed.searchParams.size === 0 || parsed.searchParams.size === 1 && ['require', 'prefer'].includes(sslMode ?? '');
    if (value.trim() !== value || !['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !allowedQuery || parsed.hash) fail('INVALID_RUNTIME_CONFIGURATION');
    return value.replace(/\?sslmode=(?:require|prefer)$/, '');
  } catch { fail('INVALID_RUNTIME_CONFIGURATION'); }
}

function json(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { fail('PERSISTENCE_CORRUPT'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PERSISTENCE_CORRUPT');
  return value as Record<string, unknown>;
}

function jsonArray(value: unknown): readonly unknown[] {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { fail('PERSISTENCE_CORRUPT'); } }
  if (!Array.isArray(value)) fail('PERSISTENCE_CORRUPT');
  return value;
}

function timestamp(value: unknown): string {
  const parsed = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) fail('PERSISTENCE_CORRUPT');
  return parsed.toISOString();
}

function canonicalField(row: SqlRow, visibility: unknown): FormComponent {
  const value = json(row.definition_json);
  if (typeof row.field_key !== 'string' || typeof value.label !== 'string' || typeof value.required !== 'boolean' || !(value.canonicalFieldId === null || typeof value.canonicalFieldId === 'string') || !Array.isArray(value.supplierAliases)) fail('PERSISTENCE_CORRUPT');
  return {
    id: row.field_key,
    label: value.label,
    required: value.required,
    canonicalFieldId: value.canonicalFieldId as string | null,
    supplierAliases: value.supplierAliases as string[],
    visibility: visibility === null || visibility === undefined ? null : json(visibility) as FormComponent['visibility'],
    definition: json(value.definition) as unknown as FormComponent['definition'],
  };
}

function catalogItem(template: SqlRow, fields: readonly SqlRow[], rules: ReadonlyMap<string, unknown>): FormTemplateCatalogItem {
  const templateId = template.template_id;
  const versionId = template.version_id;
  const version = Number(template.version);
  if (typeof templateId !== 'string' || typeof versionId !== 'string' || typeof template.name !== 'string' || !Number.isSafeInteger(version) || (template.status !== 'draft' && template.status !== 'published') || typeof template.schema_sha256 !== 'string') fail('PERSISTENCE_CORRUPT');
  const latest: FormTemplateVersion = {
    id: versionId, templateId, version, status: template.status, schemaSha256: template.schema_sha256,
    fields: fields.filter((field) => field.template_version_id === versionId).sort((a, b) => Number(a.position) - Number(b.position)).map((field) => canonicalField(field, rules.get(String(field.id)))),
  };
  return { templateId, name: template.name, updatedAt: timestamp(template.updated_at), latest };
}

function receipt(value: unknown): FormMutationReceipt {
  const parsed = json(value) as unknown as FormMutationReceipt;
  if (!parsed.template || typeof parsed.template.templateId !== 'string') fail('PERSISTENCE_CORRUPT');
  return parsed;
}

function caseInstance(row: SqlRow): CaseFormInstance {
  const version = Number(row.version);
  if (typeof row.id !== 'string' || !Number.isSafeInteger(version) || version < 1) fail('PERSISTENCE_CORRUPT');
  return { id: row.id, version, values: json(row.values_json), updatedAt: timestamp(row.updated_at) };
}

function caseReceipt(value: unknown): CaseFormMutationReceipt {
  const parsed = json(value) as unknown as CaseFormMutationReceipt;
  if (!parsed.instance || typeof parsed.instance.id !== 'string') fail('PERSISTENCE_CORRUPT');
  return parsed;
}

function submissionReceipt(value: unknown): CaseFormSubmissionReceipt {
  const parsed = json(value) as unknown as CaseFormSubmissionReceipt;
  if (!parsed.instance || typeof parsed.instance.id !== 'string' || parsed.caseState !== 'operations_review' || !Number.isSafeInteger(parsed.caseVersion) || !/^[0-9a-f]{64}$/.test(parsed.snapshotSha256)) fail('PERSISTENCE_CORRUPT');
  return parsed;
}

function mappingReviewReceipt(value: unknown): CaseFormMappingReviewReceipt {
  const parsed = json(value) as unknown as CaseFormMappingReviewReceipt;
  if (typeof parsed.mappingId !== 'string' || !Number.isSafeInteger(parsed.mappingVersion) || parsed.mappingVersion < 1 || parsed.status !== 'accepted' || typeof parsed.reviewDecisionId !== 'string') fail('PERSISTENCE_CORRUPT');
  return parsed;
}

function mappingReview(row: SqlRow, currentValues: Record<string, unknown> | null): CaseFormMappingReview {
  const payload = json(row.mapping_json);
  const fields = payload.fields;
  const values = payload.values;
  const automaticStatus = payload.status;
  const version = Number(row.version);
  if (typeof row.id !== 'string' || !Number.isSafeInteger(version) || version < 1 || !['unresolved', 'accepted', 'corrected', 'rejected'].includes(String(row.status)) || !['ready_for_operations_review', 'awaiting_xbf_information', 'awaiting_clarification'].includes(String(automaticStatus)) || typeof row.after_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.after_sha256) || payload.schemaVersion !== 1 || payload.externalEffects !== false || !Array.isArray(fields)) fail('PERSISTENCE_CORRUPT');
  const safeFields = fields.map((item) => {
    const field = json(item);
    if (typeof field.fieldId !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(field.fieldId) || !['existing_draft', 'rateware', 'attachment', 'missing'].includes(String(field.source)) || !['prepared', 'missing', 'contradictory'].includes(String(field.status)) || !Array.isArray(field.evidenceIds) || field.evidenceIds.some((id) => typeof id !== 'string')) fail('PERSISTENCE_CORRUPT');
    return {
      fieldId: field.fieldId,
      source: field.source as CaseFormMappingReview['fields'][number]['source'],
      status: field.status as CaseFormMappingReview['fields'][number]['status'],
      evidenceCount: field.evidenceIds.length,
    };
  });
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('PERSISTENCE_CORRUPT');
  return {
    id: row.id,
    version,
    status: row.status as CaseFormMappingReview['status'],
    automaticStatus: automaticStatus as CaseFormMappingReview['automaticStatus'],
    afterSha256: row.after_sha256,
    matchesCurrentDraft: currentValues !== null && formStoreInternals.stable(values) === formStoreInternals.stable(currentValues),
    fields: safeFields,
    updatedAt: timestamp(row.updated_at),
  };
}

async function readCatalog(tx: SqlPort, organizationId: string, templateId?: string): Promise<readonly FormTemplateCatalogItem[]> {
  const templates = templateId
    ? await tx`select template.id as template_id, template.name, template.updated_at, version_row.id as version_id, version_row.version, version_row.status, version_row.schema_sha256 from osp_private.form_templates template join lateral (select id, version, status, schema_sha256 from osp_private.form_template_versions where organization_id = ${organizationId} and template_id = template.id order by version desc limit 1) version_row on true where template.organization_id = ${organizationId} and template.id = ${templateId}`
    : await tx`select template.id as template_id, template.name, template.updated_at, version_row.id as version_id, version_row.version, version_row.status, version_row.schema_sha256 from osp_private.form_templates template join lateral (select id, version, status, schema_sha256 from osp_private.form_template_versions where organization_id = ${organizationId} and template_id = template.id order by version desc limit 1) version_row on true where template.organization_id = ${organizationId} order by template.updated_at desc, template.id asc limit 100`;
  const versionIds = templates.map((row) => row.version_id);
  if (versionIds.length === 0) return [];
  const fields = await tx`select id, template_version_id, position, field_key, definition_json from osp_private.form_fields where organization_id = ${organizationId} and template_version_id = any(${versionIds}::uuid[]) order by template_version_id, position`;
  const ruleRows = await tx`select target_field_id, rule_json from osp_private.form_rules where organization_id = ${organizationId} and template_version_id = any(${versionIds}::uuid[])`;
  const rules = new Map(ruleRows.map((row) => [String(row.target_field_id), row.rule_json]));
  return templates.map((template) => catalogItem(template, fields, rules));
}

async function readPublishedTemplate(tx: SqlPort, organizationId: string): Promise<FormTemplateCatalogItem | null> {
  const templates = await tx`select template.id as template_id, template.name, template.updated_at, version_row.id as version_id, version_row.version, version_row.status, version_row.schema_sha256 from osp_private.form_templates template join lateral (select id, version, status, schema_sha256 from osp_private.form_template_versions where organization_id = ${organizationId} and template_id = template.id and status = 'published' order by version desc limit 1) version_row on true where template.organization_id = ${organizationId} order by template.updated_at desc, template.id asc limit 1`;
  if (templates.length === 0) return null;
  const versionId = templates[0].version_id;
  const fields = await tx`select id, template_version_id, position, field_key, definition_json from osp_private.form_fields where organization_id = ${organizationId} and template_version_id = ${versionId} order by position`;
  const ruleRows = await tx`select target_field_id, rule_json from osp_private.form_rules where organization_id = ${organizationId} and template_version_id = ${versionId}`;
  return catalogItem(templates[0], fields, new Map(ruleRows.map((row) => [String(row.target_field_id), row.rule_json])));
}

async function readEvidenceReady(tx: SqlPort, organizationId: string, caseId: string, templateVersionId: string): Promise<boolean> {
  const documentRows = await tx`select version.id from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where version.organization_id = ${organizationId} and version.status = 'approved' and ((version.document_type = 'supplier_requirement' and document.case_id = ${caseId}) or (version.document_type in ('proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement') and (document.case_id = ${caseId} or document.case_id is null) and version.valid_from <= current_date and current_date < version.expires_at)) order by version.document_type, version.id`;
  const documentVersionIds = documentRows.map((row) => String(row.id));
  if (documentVersionIds.length === 0) return false;
  const extractionRows = await tx`select id from osp_private.document_extractions where organization_id = ${organizationId} and case_id = ${caseId} and source_version_id = any(${documentVersionIds}::uuid[]) and status = 'reviewed' order by id`;
  const extractionIds = extractionRows.map((row) => String(row.id));
  if (extractionIds.length === 0) return false;
  const decisionRows = await tx`select subject_kind, subject_id from osp_private.review_decisions where organization_id = ${organizationId} and decision in ('accepted', 'corrected') and ((subject_kind = 'document_version' and subject_id = any(${documentVersionIds}::uuid[])) or (subject_kind = 'extraction_field' and exists (select 1 from osp_private.extraction_fields field where field.organization_id = ${organizationId} and field.id = subject_id and field.extraction_id = any(${extractionIds}::uuid[]))))`;
  const reviewedDocuments = new Set(decisionRows.filter((row) => row.subject_kind === 'document_version').map((row) => String(row.subject_id)));
  if (documentVersionIds.some((id) => !reviewedDocuments.has(id))) return false;
  const mappingRows = await tx`select distinct mapping.extraction_id from osp_private.supplier_form_mappings mapping join osp_private.review_decisions decision on decision.organization_id = mapping.organization_id and decision.case_id = mapping.case_id and decision.id = mapping.review_decision_id and decision.subject_kind = 'form_mapping' and decision.subject_id = mapping.id and decision.decision = mapping.status and decision.before_sha256 = mapping.before_sha256 and decision.after_sha256 = mapping.after_sha256 where mapping.organization_id = ${organizationId} and mapping.case_id = ${caseId} and mapping.template_version_id = ${templateVersionId} and mapping.extraction_id = any(${extractionIds}::uuid[]) and mapping.status in ('accepted', 'corrected')`;
  const mappedExtractions = new Set(mappingRows.map((row) => String(row.extraction_id)));
  if (extractionIds.some((id) => !mappedExtractions.has(id))) return false;
  const fieldRows = await tx`select id, field_key, validation, evidence_json from osp_private.extraction_fields where organization_id = ${organizationId} and extraction_id = any(${extractionIds}::uuid[])`;
  if (fieldRows.length === 0 || fieldRows.some((row) => jsonArray(row.evidence_json).length === 0 || row.validation === 'invalid')) return false;
  const reviewedFields = new Set(decisionRows.filter((row) => row.subject_kind === 'extraction_field').map((row) => String(row.subject_id)));
  return fieldRows.every((row) => !(['low_confidence', 'contradictory'].includes(String(row.validation)) || /^(?:fiscal|banking)[.]/.test(String(row.field_key))) || reviewedFields.has(String(row.id)));
}

async function readCaseFormWorkspace(tx: SqlPort, organizationId: string, caseId: string): Promise<CaseFormWorkspaceRecord> {
  const cases = await tx`select case_row.id, supplier.legal_name as supplier_name, case_row.aggregate_version, case_row.state from osp_private.customer_registration_cases case_row join osp_private.supplier_counterparties supplier on supplier.organization_id = case_row.organization_id and supplier.id = case_row.supplier_id where case_row.organization_id = ${organizationId} and case_row.id = ${caseId}`;
  if (cases.length !== 1 || typeof cases[0].supplier_name !== 'string' || typeof cases[0].state !== 'string') fail('CASE_NOT_FOUND');
  const caseVersion = Number(cases[0].aggregate_version);
  if (!Number.isSafeInteger(caseVersion) || caseVersion < 0) fail('PERSISTENCE_CORRUPT');
  const template = await readPublishedTemplate(tx, organizationId);
  let instance: CaseFormInstance | null = null;
  let mappings: readonly CaseFormMappingReview[] = [];
  if (template) {
    const rows = await tx`select id, version, values_json, updated_at from osp_private.case_form_instances where organization_id = ${organizationId} and case_id = ${caseId} and template_version_id = ${template.latest.id} order by updated_at desc, id asc limit 1`;
    if (rows.length > 0) instance = caseInstance(rows[0]);
    const mappingRows = await tx`select distinct on (extraction_id) id, extraction_id, version, status, mapping_json, after_sha256, updated_at from osp_private.supplier_form_mappings where organization_id = ${organizationId} and case_id = ${caseId} and template_version_id = ${template.latest.id} order by extraction_id, updated_at desc, id desc`;
    mappings = mappingRows.map((row) => mappingReview(row, instance?.values ?? null)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const mappingsAccepted = mappings.length > 0 && mappings.every((mapping) => ['accepted', 'corrected'].includes(mapping.status));
  const mappingAcceptable = mappings.some((mapping) => mapping.status === 'unresolved' && mapping.automaticStatus === 'ready_for_operations_review' && mapping.matchesCurrentDraft && mapping.fields.every((field) => field.status === 'prepared'));
  const evidenceReady = template && mappingsAccepted ? await readEvidenceReady(tx, organizationId, caseId, template.latest.id) : false;
  return {
    caseId, supplierName: cases[0].supplier_name, caseVersion, caseState: cases[0].state,
    templateName: template?.name ?? null, template: template?.latest ?? null, instance, mappings, evidenceReady,
    saveDraftAllowed: ['awaiting_xbf_information', 'preparing'].includes(cases[0].state),
    acceptMappingAllowed: cases[0].state === 'preparing' && mappingAcceptable,
    submitForReviewAllowed: cases[0].state === 'preparing' && evidenceReady,
  };
}

async function saveCaseInstance(tx: SqlPort, input: SaveCaseFormDraftInput): Promise<CaseFormInstance> {
  const versions = await tx`select id from osp_private.form_template_versions where organization_id = ${input.organizationId} and id = ${input.templateVersionId} and status = 'published'`;
  if (versions.length !== 1) fail('FORM_NOT_FOUND');
  const fields = await tx`select field_key from osp_private.form_fields where organization_id = ${input.organizationId} and template_version_id = ${input.templateVersionId}`;
  const allowedFields = new Set(fields.map((row) => String(row.field_key)));
  if (Object.keys(input.values).some((key) => !allowedFields.has(key))) fail('FORM_SCHEMA_INVALID');
  let rows: readonly SqlRow[];
  if (input.instanceId === null) {
    if (input.expectedVersion !== 0) fail('VERSION_CONFLICT');
    const existing = await tx`select id from osp_private.case_form_instances where organization_id = ${input.organizationId} and case_id = ${input.caseId} and template_version_id = ${input.templateVersionId} for update`;
    if (existing.length > 0) fail('VERSION_CONFLICT');
    rows = await tx`insert into osp_private.case_form_instances (id, organization_id, case_id, template_version_id, version, values_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${input.templateVersionId}, 1, ${JSON.stringify(input.values)}::text::jsonb) returning id, version, values_json, updated_at`;
  } else {
    const current = await tx`select id, version, values_json, updated_at from osp_private.case_form_instances where organization_id = ${input.organizationId} and case_id = ${input.caseId} and template_version_id = ${input.templateVersionId} and id = ${input.instanceId} for update`;
    if (current.length !== 1 || Number(current[0].version) !== input.expectedVersion) fail('VERSION_CONFLICT');
    rows = formStoreInternals.stable(json(current[0].values_json)) === formStoreInternals.stable(input.values)
      ? current
      : await tx`update osp_private.case_form_instances set version = version + 1, values_json = ${JSON.stringify(input.values)}::text::jsonb, updated_at = now() where organization_id = ${input.organizationId} and case_id = ${input.caseId} and template_version_id = ${input.templateVersionId} and id = ${input.instanceId} and version = ${input.expectedVersion} returning id, version, values_json, updated_at`;
  }
  if (rows.length !== 1) fail('PERSISTENCE_FAILED');
  return caseInstance(rows[0]);
}

export function createPostgresFormStore(options: { databaseUrl: string; postgresFactory?: PostgresFactory }): FormStore {
  const factory = options.postgresFactory ?? postgres as unknown as PostgresFactory;
  const created = factory(databaseUrl(options.databaseUrl), {
    ssl: 'verify-full', fetch_types: false, prepare: false, max: 1, connect_timeout: 5,
    connection: { application_name: 'osp-form-api', statement_timeout: '5000' },
  });
  if (typeof created !== 'function') fail('INVALID_RUNTIME_CONFIGURATION');
  const sql = created as SqlPort;

  async function prior(tx: SqlPort, organizationId: string, operation: string, idempotencyKey: string, requestHash: string): Promise<FormMutationReceipt | null> {
    const rows = await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${organizationId} and operation = ${operation} and idempotency_key = ${idempotencyKey}`;
    if (rows.length === 0) return null;
    if (rows.length !== 1 || rows[0].request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT');
    return { ...receipt(rows[0].response_json), replayed: true };
  }

  async function saveReceipt(tx: SqlPort, organizationId: string, operation: string, idempotencyKey: string, requestHash: string, value: FormMutationReceipt) {
    await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${organizationId}, ${operation}, ${idempotencyKey}, ${requestHash}, ${JSON.stringify(value)}::text::jsonb)`;
  }

  async function priorCase<T extends CaseFormMutationReceipt | CaseFormMappingReviewReceipt | CaseFormSubmissionReceipt>(tx: SqlPort, organizationId: string, operation: string, idempotencyKey: string, requestHash: string, parse: (value: unknown) => T): Promise<T | null> {
    const rows = await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${organizationId} and operation = ${operation} and idempotency_key = ${idempotencyKey}`;
    if (rows.length === 0) return null;
    if (rows.length !== 1 || rows[0].request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT');
    return { ...parse(rows[0].response_json), replayed: true };
  }

  async function saveCaseReceipt(tx: SqlPort, organizationId: string, operation: string, idempotencyKey: string, requestHash: string, value: CaseFormMutationReceipt | CaseFormMappingReviewReceipt | CaseFormSubmissionReceipt) {
    await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${organizationId}, ${operation}, ${idempotencyKey}, ${requestHash}, ${JSON.stringify(value)}::text::jsonb)`;
  }

  return Object.freeze({
    async list(organizationId: string) {
      return await withOrganizationTransaction(sql, organizationId, (tx) => readCatalog(tx, organizationId));
    },
    async saveDraft(input: SaveFormDraftInput) {
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        const operation = 'save_form_template_draft';
        const requestHash = await formStoreInternals.hash(input);
        await tx`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.organizationId, operation, input.idempotencyKey])}, 0))`;
        const replay = await prior(tx, input.organizationId, operation, input.idempotencyKey, requestHash);
        if (replay) return replay;
        let templateId = input.templateId;
        let nextVersion = 1;
        if (templateId === null) {
          if (input.expectedVersion !== 0) fail('VERSION_CONFLICT');
          templateId = crypto.randomUUID();
          await tx`insert into osp_private.form_templates (id, organization_id, name, version) values (${templateId}, ${input.organizationId}, ${input.name}, 1)`;
        } else {
          const locked = await tx`select name, version from osp_private.form_templates where organization_id = ${input.organizationId} and id = ${templateId} for update`;
          if (locked.length !== 1) fail('FORM_NOT_FOUND');
          const currentVersion = Number(locked[0].version);
          if (locked[0].name !== input.name || currentVersion !== input.expectedVersion) fail('VERSION_CONFLICT');
          nextVersion = currentVersion + 1;
          await tx`update osp_private.form_templates set version = ${nextVersion}, updated_at = now() where organization_id = ${input.organizationId} and id = ${templateId}`;
        }
        const versionId = crypto.randomUUID();
        await tx`insert into osp_private.form_template_versions (id, organization_id, template_id, version, status, schema_sha256) values (${versionId}, ${input.organizationId}, ${templateId}, ${nextVersion}, 'draft', ${input.schemaSha256})`;
        for (let position = 0; position < input.fields.length; position += 1) {
          const field = input.fields[position];
          const fieldId = crypto.randomUUID();
          const definition = { label: field.label, required: field.required, canonicalFieldId: field.canonicalFieldId, supplierAliases: field.supplierAliases, definition: field.definition };
          await tx`insert into osp_private.form_fields (id, organization_id, template_version_id, position, field_key, definition_json) values (${fieldId}, ${input.organizationId}, ${versionId}, ${position}, ${field.id}, ${JSON.stringify(definition)}::text::jsonb)`;
          if (field.visibility !== null) await tx`insert into osp_private.form_rules (id, organization_id, template_version_id, target_field_id, rule_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${versionId}, ${fieldId}, ${JSON.stringify(field.visibility)}::text::jsonb)`;
        }
        const [template] = await readCatalog(tx, input.organizationId, templateId);
        if (!template) fail('PERSISTENCE_FAILED');
        const result = { template, replayed: false };
        await saveReceipt(tx, input.organizationId, operation, input.idempotencyKey, requestHash, result);
        return result;
      });
    },
    async publish(input: PublishFormInput) {
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        const operation = 'publish_form_template';
        const requestHash = await formStoreInternals.hash(input);
        await tx`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.organizationId, operation, input.idempotencyKey])}, 0))`;
        const replay = await prior(tx, input.organizationId, operation, input.idempotencyKey, requestHash);
        if (replay) return replay;
        const rows = await tx`select template.version, version_row.status from osp_private.form_templates template join osp_private.form_template_versions version_row on version_row.organization_id = template.organization_id and version_row.template_id = template.id and version_row.id = ${input.templateVersionId} where template.organization_id = ${input.organizationId} and template.id = ${input.templateId} for update of template, version_row`;
        if (rows.length !== 1) fail('FORM_NOT_FOUND');
        if (Number(rows[0].version) !== input.expectedVersion || rows[0].status !== 'draft') fail('VERSION_CONFLICT');
        const updated = await tx`update osp_private.form_template_versions set status = 'published', published_at = now() where organization_id = ${input.organizationId} and template_id = ${input.templateId} and id = ${input.templateVersionId} and version = ${input.expectedVersion} and status = 'draft' returning id`;
        if (updated.length !== 1) fail('VERSION_CONFLICT');
        await tx`update osp_private.form_templates set updated_at = now() where organization_id = ${input.organizationId} and id = ${input.templateId}`;
        const [template] = await readCatalog(tx, input.organizationId, input.templateId);
        if (!template) fail('PERSISTENCE_FAILED');
        const result = { template, replayed: false };
        await saveReceipt(tx, input.organizationId, operation, input.idempotencyKey, requestHash, result);
        return result;
      });
    },
    async getCaseFormWorkspace(organizationId: string, caseId: string) {
      return await withOrganizationTransaction(sql, organizationId, (tx) => readCaseFormWorkspace(tx, organizationId, caseId));
    },
    async saveCaseFormDraft(input: SaveCaseFormDraftInput) {
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        const operation = 'save_case_form_draft';
        const requestHash = await formStoreInternals.hash(input);
        await tx`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.organizationId, operation, input.idempotencyKey])}, 0))`;
        const replay = await priorCase(tx, input.organizationId, operation, input.idempotencyKey, requestHash, caseReceipt);
        if (replay) return replay;
        const cases = await tx`select state from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`;
        if (cases.length !== 1) fail('CASE_NOT_FOUND');
        if (!['awaiting_xbf_information', 'preparing'].includes(String(cases[0].state))) fail('CASE_FORM_LOCKED');
        const result = { instance: await saveCaseInstance(tx, input), replayed: false };
        await saveCaseReceipt(tx, input.organizationId, operation, input.idempotencyKey, requestHash, result);
        return result;
      });
    },
    async acceptCaseFormMapping(input: AcceptCaseFormMappingInput) {
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        const operation = 'accept_case_form_mapping';
        const requestHash = await formStoreInternals.hash(input);
        await tx`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.organizationId, operation, input.idempotencyKey])}, 0))`;
        const replay = await priorCase(tx, input.organizationId, operation, input.idempotencyKey, requestHash, mappingReviewReceipt);
        if (replay) return replay;
        const cases = await tx`select state from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`;
        if (cases.length !== 1) fail('CASE_NOT_FOUND');
        if (cases[0].state !== 'preparing') fail('CASE_FORM_LOCKED');
        const rows = await tx`select mapping.id, mapping.version, mapping.status, mapping.mapping_json, mapping.before_sha256, mapping.after_sha256, mapping.updated_at, instance.values_json from osp_private.supplier_form_mappings mapping left join lateral (select values_json from osp_private.case_form_instances where organization_id = mapping.organization_id and case_id = mapping.case_id and template_version_id = mapping.template_version_id order by updated_at desc, id asc limit 1) instance on true where mapping.organization_id = ${input.organizationId} and mapping.case_id = ${input.caseId} and mapping.id = ${input.mappingId} for update of mapping`;
        if (rows.length !== 1) fail('FORM_MAPPING_NOT_FOUND');
        if (rows[0].status !== 'unresolved' || Number(rows[0].version) !== input.expectedMappingVersion || rows[0].after_sha256 !== input.expectedAfterSha256) fail('VERSION_CONFLICT');
        const currentValues = rows[0].values_json === null || rows[0].values_json === undefined ? null : json(rows[0].values_json);
        const review = mappingReview(rows[0], currentValues);
        if (review.automaticStatus !== 'ready_for_operations_review' || !review.matchesCurrentDraft || review.fields.length === 0 || review.fields.some((field) => field.status !== 'prepared')) fail('FORM_MAPPING_NOT_READY');
        const reviewDecisionId = crypto.randomUUID();
        await tx`insert into osp_private.review_decisions (id, organization_id, case_id, subject_kind, subject_id, decision, reviewer_subject, reviewer_permission, before_sha256, after_sha256, reason_code, created_at) values (${reviewDecisionId}, ${input.organizationId}, ${input.caseId}, 'form_mapping', ${input.mappingId}, 'accepted', ${input.subject}, 'osp:operate', ${rows[0].before_sha256}, ${rows[0].after_sha256}, 'MAPPING_CONFIRMED', statement_timestamp())`;
        const updated = await tx`update osp_private.supplier_form_mappings set status = 'accepted', review_decision_id = ${reviewDecisionId}, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.mappingId} and version = ${input.expectedMappingVersion} and status = 'unresolved' returning version`;
        if (updated.length !== 1) fail('VERSION_CONFLICT');
        const result: CaseFormMappingReviewReceipt = { mappingId: input.mappingId, mappingVersion: Number(updated[0].version), status: 'accepted', reviewDecisionId, replayed: false };
        await saveCaseReceipt(tx, input.organizationId, operation, input.idempotencyKey, requestHash, result);
        return result;
      });
    },
    async submitCaseFormForReview(input: SubmitCaseFormForReviewInput) {
      return await withOrganizationTransaction(sql, input.organizationId, async (tx) => {
        const operation = 'submit_case_form_for_review';
        const requestHash = await formStoreInternals.hash(input);
        await tx`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.organizationId, operation, input.idempotencyKey])}, 0))`;
        const replay = await priorCase(tx, input.organizationId, operation, input.idempotencyKey, requestHash, submissionReceipt);
        if (replay) return replay;
        const cases = await tx`select state, aggregate_version from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`;
        if (cases.length !== 1) fail('CASE_NOT_FOUND');
        if (cases[0].state !== 'preparing') fail('CASE_FORM_LOCKED');
        if (Number(cases[0].aggregate_version) !== input.expectedCaseVersion) fail('VERSION_CONFLICT');
        const template = await readPublishedTemplate(tx, input.organizationId);
        if (!template || template.latest.id !== input.templateVersionId) fail('FORM_NOT_FOUND');
        if (!assessFormCompletion(template.latest, input.values).ready) fail('FORM_INCOMPLETE');

        const documentRows = await tx`select version.id from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where version.organization_id = ${input.organizationId} and version.status = 'approved' and ((version.document_type = 'supplier_requirement' and document.case_id = ${input.caseId}) or (version.document_type in ('proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement') and (document.case_id = ${input.caseId} or document.case_id is null) and version.valid_from <= current_date and current_date < version.expires_at)) order by version.document_type, version.id`;
        const documentVersionIds = documentRows.map((row) => String(row.id));
        const extractionRows = documentVersionIds.length === 0 ? [] : await tx`select id from osp_private.document_extractions where organization_id = ${input.organizationId} and case_id = ${input.caseId} and source_version_id = any(${documentVersionIds}::uuid[]) and status = 'reviewed' order by id`;
        const extractionIds = extractionRows.map((row) => String(row.id));
        if (documentVersionIds.length === 0 || extractionIds.length === 0) fail('CASE_REVIEW_NOT_READY');

        const decisionRows = await tx`select distinct decision.id from osp_private.review_decisions decision where decision.organization_id = ${input.organizationId} and decision.decision in ('accepted', 'corrected') and ((decision.subject_kind = 'document_version' and decision.subject_id = any(${documentVersionIds}::uuid[])) or (decision.subject_kind = 'extraction_field' and exists (select 1 from osp_private.extraction_fields field where field.organization_id = decision.organization_id and field.id = decision.subject_id and field.extraction_id = any(${extractionIds}::uuid[]))) or (decision.subject_kind = 'form_mapping' and exists (select 1 from osp_private.supplier_form_mappings mapping where mapping.organization_id = decision.organization_id and mapping.case_id = ${input.caseId} and mapping.id = decision.subject_id and mapping.template_version_id = ${input.templateVersionId} and mapping.extraction_id = any(${extractionIds}::uuid[])))) order by decision.id`;
        const reviewDecisionIds = decisionRows.map((row) => String(row.id));
        const mappingRows = await tx`select coalesce(jsonb_agg(jsonb_build_object('mappingId', mapping.id::text, 'mappingVersion', mapping.version, 'mappingSha256', mapping.after_sha256, 'extractionId', mapping.extraction_id::text, 'reviewDecisionId', mapping.review_decision_id::text) order by mapping.id::text), '[]'::jsonb) as refs from osp_private.supplier_form_mappings mapping join osp_private.review_decisions decision on decision.organization_id = mapping.organization_id and decision.case_id = mapping.case_id and decision.id = mapping.review_decision_id and decision.subject_kind = 'form_mapping' and decision.subject_id = mapping.id and decision.decision = mapping.status and decision.before_sha256 = mapping.before_sha256 and decision.after_sha256 = mapping.after_sha256 where mapping.organization_id = ${input.organizationId} and mapping.case_id = ${input.caseId} and mapping.template_version_id = ${input.templateVersionId} and mapping.extraction_id = any(${extractionIds}::uuid[]) and mapping.status in ('accepted', 'corrected')`;
        const fieldRows = await tx`select coalesce(jsonb_agg(jsonb_build_object('fieldId', field.id::text, 'extractionId', field.extraction_id::text, 'kind', evidence->>'kind', 'sourceVersionId', evidence->>'sourceVersionId', 'rawEvidenceHash', evidence->>'rawEvidenceHash') order by field.id::text, field.extraction_id::text, evidence->>'kind', evidence->>'sourceVersionId', evidence->>'rawEvidenceHash'), '[]'::jsonb) as refs from osp_private.extraction_fields field cross join lateral jsonb_array_elements(field.evidence_json) as item(evidence) where field.organization_id = ${input.organizationId} and field.extraction_id = any(${extractionIds}::uuid[])`;
        const mappingRefs = jsonArray(mappingRows[0]?.refs);
        const fieldEvidenceRefs = jsonArray(fieldRows[0]?.refs);
        if (reviewDecisionIds.length === 0 || mappingRefs.length === 0 || fieldEvidenceRefs.length === 0) fail('CASE_REVIEW_NOT_READY');

        const instance = await saveCaseInstance(tx, input);
        const nextCaseVersion = input.expectedCaseVersion + 1;
        const advanced = await tx`update osp_private.customer_registration_cases set state = 'operations_review', aggregate_version = aggregate_version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${input.caseId} and state = 'preparing' and aggregate_version = ${input.expectedCaseVersion} returning aggregate_version`;
        if (advanced.length !== 1 || Number(advanced[0].aggregate_version) !== nextCaseVersion) fail('VERSION_CONFLICT');
        const snapshots = await tx`insert into osp_private.case_package_input_snapshots (id, organization_id, case_id, case_version, document_version_ids, extraction_ids, template_version_id, form_instance_id, form_instance_version, review_decision_ids, mapping_refs, field_evidence_refs) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${nextCaseVersion}, ${documentVersionIds}::uuid[], ${extractionIds}::uuid[], ${input.templateVersionId}, ${instance.id}, ${instance.version}, ${reviewDecisionIds}::uuid[], ${JSON.stringify(mappingRefs)}::text::jsonb, ${JSON.stringify(fieldEvidenceRefs)}::text::jsonb) returning id, canonical_sha256`;
        if (snapshots.length !== 1 || typeof snapshots[0].canonical_sha256 !== 'string') fail('SNAPSHOT_PERSISTENCE_FAILED');
        await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${nextCaseVersion}, 'operations_review', ${input.subject}, 'operations', ${input.expectedCaseVersion}, statement_timestamp(), 'case_form_submitted_for_review', ${crypto.randomUUID()}, ${JSON.stringify([String(snapshots[0].id)])}::text::jsonb)`;
        const result: CaseFormSubmissionReceipt = { instance, caseState: 'operations_review', caseVersion: nextCaseVersion, snapshotSha256: snapshots[0].canonical_sha256, replayed: false };
        await saveCaseReceipt(tx, input.organizationId, operation, input.idempotencyKey, requestHash, result);
        return result;
      });
    },
  });
}
