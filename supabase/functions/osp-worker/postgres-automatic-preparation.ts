import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import type {
  AutomaticPreparationInput,
  AutomaticPreparationPlan,
  AutomaticPreparationStore,
  PreparationCandidate,
  PreparationTemplateField,
} from "./automatic-preparation.ts";
import { prepareCaseForm } from "./automatic-preparation.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type PostgresAutomaticPreparationOptions = Readonly<{
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function requireDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || url.search || url.hash
    ) fail("INVALID_RUNTIME_CONFIGURATION");
    return value;
  } catch {
    fail("INVALID_RUNTIME_CONFIGURATION");
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      fail("DATABASE_TEMPORARY");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("DATABASE_TEMPORARY");
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail("DATABASE_TEMPORARY");
  }
  return Object.freeze([...value]);
}

function templateField(row: SqlRow): PreparationTemplateField {
  if (typeof row.field_key !== "string") fail("DATABASE_TEMPORARY");
  const definition = jsonObject(row.definition_json);
  const canonicalFieldId = definition.canonicalFieldId;
  if (
    typeof definition.required !== "boolean" ||
    !(canonicalFieldId === null || typeof canonicalFieldId === "string")
  ) fail("DATABASE_TEMPORARY");
  return Object.freeze({
    fieldId: row.field_key,
    canonicalFieldId,
    supplierAliases: strings(definition.supplierAliases),
    required: definition.required,
  });
}

function extractionCandidate(row: SqlRow): PreparationCandidate {
  const confidence = Number(row.confidence);
  if (
    typeof row.id !== "string" || typeof row.field_key !== "string" ||
    row.presence !== "present" || !Number.isFinite(confidence) ||
    !["valid", "low_confidence", "contradictory", "invalid"].includes(
      String(row.validation),
    )
  ) fail("DATABASE_TEMPORARY");
  return Object.freeze({
    fieldKey: row.field_key,
    value: row.value_json,
    source: "attachment",
    confidence,
    validation: row.validation as PreparationCandidate["validation"],
    evidenceIds: Object.freeze([row.id]),
  });
}

function ratewareCandidate(row: SqlRow): PreparationCandidate {
  if (
    typeof row.field_key !== "string" ||
    typeof row.evidence_id !== "string" || row.evidence_id.length < 1
  ) fail("DATABASE_TEMPORARY");
  return Object.freeze({
    fieldKey: row.field_key,
    value: row.value_json,
    source: "rateware" as const,
    confidence: 1,
    validation: "valid" as const,
    evidenceIds: Object.freeze([row.evidence_id]),
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return "{" + Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",") +
    "}";
}

async function hash(value: unknown): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(canonical(value)));
}

function mappingPayload(
  plan: AutomaticPreparationPlan,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: plan.status,
    values: plan.values,
    fields: plan.fields,
    externalEffects: false,
  };
}

async function loadPreparation(
  tx: SqlPort,
  input: {
    organizationId: string;
    caseId: string;
    extractionId: string;
    templateVersionId: string;
  },
  lockSources: boolean,
): Promise<AutomaticPreparationInput> {
  const cases = lockSources
    ? await tx`select id from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`
    : await tx`select id from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId}`;
  if (cases.length !== 1) fail("INVALID_INPUT");
  const versions =
    await tx`select id from osp_private.form_template_versions where organization_id = ${input.organizationId} and id = ${input.templateVersionId} and status = 'published'`;
  if (versions.length !== 1) fail("INVALID_INPUT");
  const extractions =
    await tx`select id from osp_private.document_extractions where organization_id = ${input.organizationId} and id = ${input.extractionId} and case_id = ${input.caseId} and status in ('review_required', 'reviewed')`;
  if (extractions.length !== 1) fail("INVALID_INPUT");
  const fieldRows =
    await tx`select field_key, definition_json from osp_private.form_fields where organization_id = ${input.organizationId} and template_version_id = ${input.templateVersionId} order by position, id`;
  if (fieldRows.length === 0) fail("INVALID_INPUT");
  const ratewareRows =
    await tx`select field_key, value_json, evidence_id from osp_private.load_xbf_customer_setup_candidates_for_case(${input.organizationId}, ${input.caseId}) order by field_key, evidence_id`;
  const extractionRows =
    await tx`select id, field_key, presence, value_json, confidence, validation from osp_private.extraction_fields where organization_id = ${input.organizationId} and extraction_id = ${input.extractionId} and presence = 'present' order by field_key, id`;
  const instances = lockSources
    ? await tx`select values_json from osp_private.case_form_instances where organization_id = ${input.organizationId} and case_id = ${input.caseId} and template_version_id = ${input.templateVersionId} order by updated_at desc, id asc limit 1 for update`
    : await tx`select values_json from osp_private.case_form_instances where organization_id = ${input.organizationId} and case_id = ${input.caseId} and template_version_id = ${input.templateVersionId} order by updated_at desc, id asc limit 1`;
  const mappings = lockSources
    ? await tx`select mapping_json from osp_private.supplier_form_mappings where organization_id = ${input.organizationId} and case_id = ${input.caseId} and extraction_id = ${input.extractionId} and template_version_id = ${input.templateVersionId} and status = 'unresolved' order by updated_at desc, id asc limit 1 for update`
    : await tx`select mapping_json from osp_private.supplier_form_mappings where organization_id = ${input.organizationId} and case_id = ${input.caseId} and extraction_id = ${input.extractionId} and template_version_id = ${input.templateVersionId} and status = 'unresolved' order by updated_at desc, id asc limit 1`;
  const instanceValues = instances.length === 0
    ? {}
    : jsonObject(instances[0].values_json);
  const mappingValues = mappings.length === 0
    ? null
    : jsonObject(jsonObject(mappings[0].mapping_json).values);
  const automaticDraft = mappingValues !== null &&
    canonical(instanceValues) === canonical(mappingValues);
  return Object.freeze({
    caseId: input.caseId,
    extractionId: input.extractionId,
    templateVersionId: input.templateVersionId,
    fields: Object.freeze(fieldRows.map(templateField)),
    candidates: Object.freeze([
      ...ratewareRows.map(ratewareCandidate),
      ...extractionRows.map(extractionCandidate),
    ]),
    currentValues: Object.freeze(automaticDraft ? {} : instanceValues),
  });
}

async function saveFormInstance(
  tx: SqlPort,
  input: {
    organizationId: string;
    caseId: string;
    templateVersionId: string;
    values: Readonly<Record<string, unknown>>;
  },
): Promise<string> {
  const rows =
    await tx`select instance.id, instance.version, instance.values_json, exists (select 1 from osp_private.case_package_input_snapshots snapshot where snapshot.organization_id = instance.organization_id and snapshot.form_instance_id = instance.id) as consumed from osp_private.case_form_instances instance where instance.organization_id = ${input.organizationId} and instance.case_id = ${input.caseId} and instance.template_version_id = ${input.templateVersionId} order by instance.updated_at desc, instance.id asc limit 1 for update of instance`;
  const valuesJson = JSON.stringify(input.values);
  if (rows.length === 0 || rows[0].consumed === true) {
    const id = crypto.randomUUID();
    await tx`insert into osp_private.case_form_instances (id, organization_id, case_id, template_version_id, version, values_json) values (${id}, ${input.organizationId}, ${input.caseId}, ${input.templateVersionId}, 1, ${valuesJson}::text::jsonb)`;
    return id;
  }
  if (rows.length !== 1 || typeof rows[0].id !== "string") {
    fail("DATABASE_TEMPORARY");
  }
  const currentValues = jsonObject(rows[0].values_json);
  if (canonical(currentValues) !== canonical(input.values)) {
    await tx`update osp_private.case_form_instances set values_json = ${valuesJson}::text::jsonb, version = version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${
      rows[0].id
    }`;
  }
  return rows[0].id;
}

async function saveMapping(
  tx: SqlPort,
  input: {
    organizationId: string;
    caseId: string;
    extractionId: string;
    templateVersionId: string;
    plan: AutomaticPreparationPlan;
  },
): Promise<string> {
  const payload = mappingPayload(input.plan);
  const afterSha256 = await hash(payload);
  const rows =
    await tx`select id, version, status, mapping_json, after_sha256 from osp_private.supplier_form_mappings where organization_id = ${input.organizationId} and case_id = ${input.caseId} and extraction_id = ${input.extractionId} and template_version_id = ${input.templateVersionId} order by updated_at desc, id asc limit 1 for update`;
  if (rows.length > 1) fail("DATABASE_TEMPORARY");
  const current = rows[0];
  if (current?.status === "unresolved") {
    if (current.after_sha256 !== afterSha256) {
      if (
        typeof current.id !== "string" ||
        typeof current.after_sha256 !== "string"
      ) {
        fail("DATABASE_TEMPORARY");
      }
      await tx`update osp_private.supplier_form_mappings set mapping_json = ${
        JSON.stringify(payload)
      }::text::jsonb, before_sha256 = ${current.after_sha256}, after_sha256 = ${afterSha256}, version = version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${current.id} and status = 'unresolved'`;
    }
    if (typeof current.id !== "string") fail("DATABASE_TEMPORARY");
    return current.id;
  }
  const id = crypto.randomUUID();
  const beforeSha256 = current && typeof current.after_sha256 === "string"
    ? current.after_sha256
    : await hash({});
  await tx`insert into osp_private.supplier_form_mappings (id, organization_id, case_id, template_version_id, extraction_id, version, status, mapping_json, before_sha256, after_sha256) values (${id}, ${input.organizationId}, ${input.caseId}, ${input.templateVersionId}, ${input.extractionId}, 1, 'unresolved', ${
    JSON.stringify(payload)
  }::text::jsonb, ${beforeSha256}, ${afterSha256})`;
  return id;
}

function targetState(plan: AutomaticPreparationPlan): string {
  if (plan.status === "awaiting_clarification") return "awaiting_clarification";
  if (plan.status === "awaiting_xbf_information") {
    return "awaiting_xbf_information";
  }
  return "preparing";
}

async function transition(
  tx: SqlPort,
  input: {
    organizationId: string;
    caseId: string;
    from: string;
    to: string;
    reasonCode: string;
    correlationId: string;
    mappingId: string;
    extractionId: string;
  },
): Promise<void> {
  const rows =
    await tx`select aggregate_version from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} and state = ${input.from} for update`;
  const sourceVersion = Number(rows[0]?.aggregate_version);
  if (
    rows.length !== 1 || !Number.isSafeInteger(sourceVersion) ||
    sourceVersion < 0
  ) {
    fail("VERSION_CONFLICT");
  }
  const advanced =
    await tx`update osp_private.customer_registration_cases set state = ${input.to}, aggregate_version = aggregate_version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${input.caseId} and state = ${input.from} and aggregate_version = ${sourceVersion} returning aggregate_version`;
  const nextVersion = Number(advanced[0]?.aggregate_version);
  if (advanced.length !== 1 || nextVersion !== sourceVersion + 1) {
    fail("VERSION_CONFLICT");
  }
  await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${nextVersion}, ${input.to}, 'osp-worker', 'system', ${sourceVersion}, statement_timestamp(), ${input.reasonCode}, ${input.correlationId}, ${
    JSON.stringify([input.mappingId, input.extractionId])
  }::text::jsonb)`;
}

async function advanceCase(
  tx: SqlPort,
  input: {
    organizationId: string;
    caseId: string;
    plan: AutomaticPreparationPlan;
    correlationId: string;
    mappingId: string;
    extractionId: string;
  },
): Promise<void> {
  const cases =
    await tx`select state from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`;
  if (cases.length !== 1 || typeof cases[0].state !== "string") {
    fail("INVALID_INPUT");
  }
  let state = cases[0].state;
  if (state === "received") {
    await transition(tx, {
      ...input,
      from: "received",
      to: "analyzing_requirements",
      reasonCode: "requirements_analysis_started",
    });
    state = "analyzing_requirements";
  }
  const target = targetState(input.plan);
  if (state === target) return;
  const allowed = state === "analyzing_requirements" ||
    (["awaiting_xbf_information", "awaiting_clarification"].includes(state) &&
      ["preparing", "awaiting_xbf_information", "awaiting_clarification"]
        .includes(target));
  if (!allowed) fail("INVALID_INPUT");
  await transition(tx, {
    ...input,
    from: state,
    to: target,
    reasonCode: target === "preparing"
      ? "preparation_started"
      : target === "awaiting_xbf_information"
      ? "xbf_information_requested"
      : "clarification_requested",
  });
}

export function createPostgresAutomaticPreparationStore(
  options: PostgresAutomaticPreparationOptions,
): AutomaticPreparationStore {
  const created =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      requireDatabaseUrl(options.databaseUrl),
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-automatic-preparation",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") fail("INVALID_RUNTIME_CONFIGURATION");
  const sql = created as SqlPort;
  return Object.freeze({
    async load(
      input: Parameters<AutomaticPreparationStore["load"]>[0],
    ): Promise<AutomaticPreparationInput> {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => await loadPreparation(tx, input, false),
      );
    },
    async persist(
      input: Parameters<AutomaticPreparationStore["persist"]>[0],
    ): Promise<void> {
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const lockKey = JSON.stringify([
            input.organizationId,
            "automatic_preparation",
            input.caseId,
            input.extractionId,
            input.templateVersionId,
          ]);
          await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          const fresh = await loadPreparation(tx, input, true);
          if (canonical(prepareCaseForm(fresh)) !== canonical(input.plan)) {
            fail("VERSION_CONFLICT");
          }
          const mappingId = await saveMapping(tx, input);
          await saveFormInstance(tx, {
            organizationId: input.organizationId,
            caseId: input.caseId,
            templateVersionId: input.templateVersionId,
            values: input.plan.values,
          });
          await advanceCase(tx, { ...input, mappingId });
        },
      );
    },
  });
}
