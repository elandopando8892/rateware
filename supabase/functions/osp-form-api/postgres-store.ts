import postgres from 'npm:postgres@3.4.7';

import type { FormComponent, FormTemplateVersion } from '../../../apps/osp/src/features/forms/surveyjs-canonical-adapter.ts';
import { withOrganizationTransaction, type SqlPort, type SqlRow } from '../_shared/osp/database-context.ts';
import { formStoreInternals, type CaseFormInstance, type CaseFormMutationReceipt, type CaseFormWorkspaceRecord, type FormMutationReceipt, type FormStore, type FormTemplateCatalogItem, type PublishFormInput, type SaveCaseFormDraftInput, type SaveFormDraftInput } from './store.ts';

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

async function readCaseFormWorkspace(tx: SqlPort, organizationId: string, caseId: string): Promise<CaseFormWorkspaceRecord> {
  const cases = await tx`select case_row.id, supplier.legal_name as supplier_name, case_row.aggregate_version, case_row.state from osp_private.customer_registration_cases case_row join osp_private.supplier_counterparties supplier on supplier.organization_id = case_row.organization_id and supplier.id = case_row.supplier_id where case_row.organization_id = ${organizationId} and case_row.id = ${caseId}`;
  if (cases.length !== 1 || typeof cases[0].supplier_name !== 'string' || typeof cases[0].state !== 'string') fail('CASE_NOT_FOUND');
  const caseVersion = Number(cases[0].aggregate_version);
  if (!Number.isSafeInteger(caseVersion) || caseVersion < 0) fail('PERSISTENCE_CORRUPT');
  const template = await readPublishedTemplate(tx, organizationId);
  let instance: CaseFormInstance | null = null;
  if (template) {
    const rows = await tx`select id, version, values_json, updated_at from osp_private.case_form_instances where organization_id = ${organizationId} and case_id = ${caseId} and template_version_id = ${template.latest.id} order by updated_at desc, id asc limit 1`;
    if (rows.length > 0) instance = caseInstance(rows[0]);
  }
  return {
    caseId, supplierName: cases[0].supplier_name, caseVersion, caseState: cases[0].state,
    templateName: template?.name ?? null, template: template?.latest ?? null, instance,
    saveDraftAllowed: ['awaiting_xbf_information', 'preparing'].includes(cases[0].state),
  };
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

  async function priorCase(tx: SqlPort, organizationId: string, operation: string, idempotencyKey: string, requestHash: string): Promise<CaseFormMutationReceipt | null> {
    const rows = await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${organizationId} and operation = ${operation} and idempotency_key = ${idempotencyKey}`;
    if (rows.length === 0) return null;
    if (rows.length !== 1 || rows[0].request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT');
    return { ...caseReceipt(rows[0].response_json), replayed: true };
  }

  async function saveCaseReceipt(tx: SqlPort, organizationId: string, operation: string, idempotencyKey: string, requestHash: string, value: CaseFormMutationReceipt) {
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
        const replay = await priorCase(tx, input.organizationId, operation, input.idempotencyKey, requestHash);
        if (replay) return replay;
        const cases = await tx`select state from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`;
        if (cases.length !== 1) fail('CASE_NOT_FOUND');
        if (!['awaiting_xbf_information', 'preparing'].includes(String(cases[0].state))) fail('CASE_FORM_LOCKED');
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
        const result = { instance: caseInstance(rows[0]), replayed: false };
        await saveCaseReceipt(tx, input.organizationId, operation, input.idempotencyKey, requestHash, result);
        return result;
      });
    },
  });
}
