import postgres from "postgres";

import {
  type SqlPort,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type { VerifiedApprovalIdentity } from "../_shared/osp/workflow-authority.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const KEY = /^[A-Za-z0-9:_-]{1,256}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const PDF = "application/pdf" as const;
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

export type NativeArtifactTarget =
  | Readonly<{
    kind: "acroform";
    canonicalFieldId: string;
    fieldName: string;
  }>
  | Readonly<{
    kind: "overlay";
    canonicalFieldId: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
  }>
  | Readonly<{
    kind: "content_control";
    canonicalFieldId: string;
    targetTag: string;
  }>;

export type NativeArtifactTargetField = Readonly<{
  canonicalFieldId: string;
  label: string;
  target: NativeArtifactTarget | null;
}>;

export type NativeArtifactTargetReview = Readonly<{
  state: "ready" | "missing" | "ambiguous" | "stale" | "persisted";
  mappingId: string;
  mappingVersion: number;
  mappingSha256: string;
  mappingDecisionId: string;
  sourceVersionId: string;
  sourceSha256: string;
  contentType: typeof PDF | typeof DOCX;
  sourceBucketId: string;
  sourceObjectKey: string;
  sourceDownloadUrl: string | null;
  requiredFieldCount: number;
  mappedFieldCount: number;
  completionPercent: number;
  fields: readonly NativeArtifactTargetField[];
}>;

export type RecordNativeArtifactTargetsInput = Readonly<{
  caseId: string;
  mappingId: string;
  expectedMappingVersion: number;
  expectedMappingSha256: string;
  expectedSourceVersionId: string;
  expectedSourceSha256: string;
  idempotencyKey: string;
  targets: readonly NativeArtifactTarget[];
}>;

export type NativeArtifactTargetReceipt = Readonly<{
  mappingId: string;
  mappingVersion: number;
  mappingSha256: string;
  mappingReviewDecisionId: string;
  caseState: "preparing";
  caseVersion: number;
  replayed: boolean;
}>;

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

type TargetRow = {
  case_state: unknown;
  ref_mapping_id: unknown;
  ref_mapping_version: unknown;
  ref_mapping_sha256: unknown;
  mapping_id: unknown;
  mapping_version: unknown;
  mapping_sha256: unknown;
  mapping_before_sha256: unknown;
  mapping_status: unknown;
  mapping_decision_id: unknown;
  decision_valid: unknown;
  candidate_count: unknown;
  source_version_id: unknown;
  source_sha256: unknown;
  source_status: unknown;
  extraction_status: unknown;
  content_type: unknown;
  source_bucket_id: unknown;
  source_object_key: unknown;
  fields: unknown;
};

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return Object.keys(value).sort().join("\0") === expected.sort().join("\0");
}

export function parseNativeTarget(
  value: unknown,
  contentType?: typeof PDF | typeof DOCX,
): NativeArtifactTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ARTIFACT_TARGET_INVALID");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.canonicalFieldId !== "string" ||
    !FIELD.test(row.canonicalFieldId)
  ) {
    throw new Error("ARTIFACT_TARGET_INVALID");
  }
  if (row.kind === "acroform" && contentType !== DOCX) {
    if (
      !exactKeys(row, ["canonicalFieldId", "fieldName", "kind"]) ||
      typeof row.fieldName !== "string" ||
      row.fieldName.trim() !== row.fieldName ||
      row.fieldName.length < 1 || row.fieldName.length > 256
    ) throw new Error("ARTIFACT_TARGET_INVALID");
    return Object.freeze({
      kind: "acroform",
      canonicalFieldId: row.canonicalFieldId,
      fieldName: row.fieldName,
    });
  }
  if (row.kind === "overlay" && contentType !== DOCX) {
    if (
      !exactKeys(row, [
        "canonicalFieldId",
        "fontSize",
        "height",
        "kind",
        "page",
        "width",
        "x",
        "y",
      ]) || !Number.isSafeInteger(row.page) || Number(row.page) < 1 ||
      [row.x, row.y].some((entry) =>
        typeof entry !== "number" || !Number.isFinite(entry) || entry < 0
      ) || [row.width, row.height, row.fontSize].some((entry) =>
        typeof entry !== "number" || !Number.isFinite(entry) || entry <= 0
      ) || Number(row.fontSize) > Number(row.height)
    ) {
      throw new Error("ARTIFACT_TARGET_INVALID");
    }
    return Object.freeze({
      kind: "overlay",
      canonicalFieldId: row.canonicalFieldId,
      page: Number(row.page),
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      fontSize: Number(row.fontSize),
    });
  }
  if (row.kind === "content_control" && contentType !== PDF) {
    if (
      !exactKeys(row, ["canonicalFieldId", "kind", "targetTag"]) ||
      typeof row.targetTag !== "string" || !FIELD.test(row.targetTag)
    ) throw new Error("ARTIFACT_TARGET_INVALID");
    return Object.freeze({
      kind: "content_control",
      canonicalFieldId: row.canonicalFieldId,
      targetTag: row.targetTag,
    });
  }
  throw new Error("ARTIFACT_TARGET_INVALID");
}

export function validateNativeTargetSet(
  contentType: typeof PDF | typeof DOCX,
  values: readonly unknown[],
  expectedCanonicalIds?: readonly string[],
): readonly NativeArtifactTarget[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 500) {
    throw new Error("ARTIFACT_TARGET_INVALID");
  }
  const targets = values.map((value) => parseNativeTarget(value, contentType));
  const canonicalIds = targets.map((target) => target.canonicalFieldId);
  const destinations = targets.map((target) =>
    target.kind === "acroform"
      ? `acroform:${target.fieldName}`
      : target.kind === "content_control"
      ? `content_control:${target.targetTag}`
      : `overlay:${target.page}:${target.x}:${target.y}:${target.width}:${target.height}:${target.fontSize}`
  );
  if (
    new Set(canonicalIds).size !== targets.length ||
    new Set(destinations).size !== targets.length ||
    (expectedCanonicalIds && (
      expectedCanonicalIds.length !== targets.length ||
      [...expectedCanonicalIds].sort().join("\0") !==
        canonicalIds.sort().join("\0")
    ))
  ) throw new Error("ARTIFACT_TARGET_COVERAGE_INVALID");
  return Object.freeze(
    [...targets].sort((a, b) =>
      a.canonicalFieldId.localeCompare(b.canonicalFieldId)
    ),
  );
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new Error("NATIVE_TARGET_REVIEW_INVALID");
  }
  return parsed;
}

function parseFields(
  value: unknown,
  contentType: typeof PDF | typeof DOCX,
): readonly NativeArtifactTargetField[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new Error("NATIVE_TARGET_REVIEW_INVALID");
  }
  return Object.freeze(value.map((candidate) => {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    ) {
      throw new Error("NATIVE_TARGET_REVIEW_INVALID");
    }
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.canonicalFieldId !== "string" ||
      !FIELD.test(row.canonicalFieldId) ||
      typeof row.label !== "string" || row.label.length < 1 ||
      row.label.length > 256
    ) throw new Error("NATIVE_TARGET_REVIEW_INVALID");
    return Object.freeze({
      canonicalFieldId: row.canonicalFieldId,
      label: row.label,
      target: row.target === null
        ? null
        : parseNativeTarget(row.target, contentType),
    });
  }));
}

export function parseNativeTargetReviewRows(
  rows: readonly TargetRow[],
): readonly NativeArtifactTargetReview[] {
  const sourceCounts = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.source_version_id);
    sourceCounts.set(id, (sourceCounts.get(id) ?? 0) + 1);
  }
  return Object.freeze(rows.map((row) => {
    const contentType = row.content_type;
    if (contentType !== PDF && contentType !== DOCX) {
      throw new Error("NATIVE_TARGET_REVIEW_INVALID");
    }
    const fields = parseFields(row.fields, contentType);
    const mappingId = String(row.mapping_id);
    const mappingSha256 = String(row.mapping_sha256);
    const sourceVersionId = String(row.source_version_id);
    const sourceSha256 = String(row.source_sha256);
    const decisionId = String(row.mapping_decision_id);
    if (
      !UUID.test(mappingId) || !SHA.test(mappingSha256) ||
      !UUID.test(sourceVersionId) || !SHA.test(sourceSha256) ||
      !UUID.test(decisionId) || typeof row.source_bucket_id !== "string" ||
      typeof row.source_object_key !== "string"
    ) throw new Error("NATIVE_TARGET_REVIEW_INVALID");
    const mappedFieldCount = fields.filter((field) =>
      field.target !== null
    ).length;
    const exactReference = mappingId === row.ref_mapping_id &&
      positiveInteger(row.mapping_version) ===
        Number(row.ref_mapping_version) &&
      mappingSha256 === row.ref_mapping_sha256;
    const persisted = row.case_state === "preparing" &&
      String(row.mapping_before_sha256) === row.ref_mapping_sha256 &&
      positiveInteger(row.mapping_version) ===
        Number(row.ref_mapping_version) + 1;
    const stale =
      row.mapping_status !== "accepted" && row.mapping_status !== "corrected" ||
      row.decision_valid !== true || row.source_status !== "approved" ||
      row.extraction_status !== "reviewed" || (!exactReference && !persisted);
    // Persisting creates one direct successor while the immutable reviewed
    // mapping remains present. That exact pair is the expected post-command
    // shape; any additional candidate is still ambiguous and fails closed.
    const expectedCandidateCount = persisted ? 2 : 1;
    const ambiguous = Number(row.candidate_count) !== expectedCandidateCount ||
      (sourceCounts.get(sourceVersionId) ?? 0) !== 1 ||
      new Set(fields.map((field) => field.canonicalFieldId)).size !==
        fields.length;
    const state = ambiguous
      ? "ambiguous"
      : stale
      ? "stale"
      : persisted
      ? "persisted"
      : mappedFieldCount === fields.length
      ? "ready"
      : "missing";
    return Object.freeze({
      state,
      mappingId,
      mappingVersion: positiveInteger(row.mapping_version),
      mappingSha256,
      mappingDecisionId: decisionId,
      sourceVersionId,
      sourceSha256,
      contentType,
      sourceBucketId: row.source_bucket_id,
      sourceObjectKey: row.source_object_key,
      sourceDownloadUrl: null,
      requiredFieldCount: fields.length,
      mappedFieldCount,
      completionPercent: Math.floor(mappedFieldCount * 100 / fields.length),
      fields,
    });
  }));
}

export interface NativeArtifactTargetsStore {
  load(
    input: { organizationId: string; caseId: string },
  ): Promise<readonly NativeArtifactTargetReview[]>;
  record(
    input: RecordNativeArtifactTargetsInput,
    identity: VerifiedApprovalIdentity,
  ): Promise<NativeArtifactTargetReceipt>;
}

export async function loadNativeArtifactTargetReviews(
  tx: SqlPort,
  input: { organizationId: string; caseId: string },
): Promise<readonly NativeArtifactTargetReview[]> {
  const { organizationId, caseId } = input;
  const rows =
    await tx`select case_record.state as case_state, ref->>'mappingId' as ref_mapping_id, (ref->>'mappingVersion')::integer as ref_mapping_version, ref->>'mappingSha256' as ref_mapping_sha256, mapping.id::text as mapping_id, mapping.version as mapping_version, mapping.after_sha256 as mapping_sha256, mapping.before_sha256 as mapping_before_sha256, mapping.status as mapping_status, mapping.review_decision_id::text as mapping_decision_id, exists (select 1 from osp_private.review_decisions decision where decision.organization_id = mapping.organization_id and decision.case_id = mapping.case_id and decision.id = mapping.review_decision_id and decision.subject_kind = 'form_mapping' and decision.subject_id = mapping.id and decision.decision = mapping.status and decision.before_sha256 = mapping.before_sha256 and decision.after_sha256 = mapping.after_sha256) as decision_valid, candidate.candidate_count, version.id::text as source_version_id, version.source_sha256, version.status as source_status, extraction.status as extraction_status, version.content_type, version.bucket_id as source_bucket_id, version.opaque_object_key as source_object_key, coalesce((select jsonb_agg(jsonb_build_object('canonicalFieldId', field.definition_json->>'canonicalFieldId', 'label', coalesce(field.definition_json->>'label', field.definition_json->>'canonicalFieldId'), 'target', (select target from jsonb_array_elements(coalesce(mapping.mapping_json->'artifactTargets','[]'::jsonb)) item(target) where target->>'canonicalFieldId' = field.definition_json->>'canonicalFieldId' limit 1)) order by field.position, field.id) from jsonb_array_elements(coalesce(mapping.mapping_json->'fields','[]'::jsonb)) item(plan_field) join osp_private.form_fields field on field.organization_id = snapshot.organization_id and field.template_version_id = snapshot.template_version_id and field.field_key = plan_field->>'fieldId' where plan_field->>'status' = 'prepared' and jsonb_typeof(instance.values_json->field.field_key) in ('string','number','boolean')), '[]'::jsonb) as fields from osp_private.customer_registration_cases case_record join lateral (select value.* from osp_private.case_package_input_snapshots value where value.organization_id = case_record.organization_id and value.case_id = case_record.id order by value.created_at desc, value.id desc limit 1) snapshot on true join osp_private.case_form_instances instance on instance.organization_id = snapshot.organization_id and instance.case_id = snapshot.case_id and instance.id = snapshot.form_instance_id and instance.version = snapshot.form_instance_version cross join lateral jsonb_array_elements(snapshot.mapping_refs) item(ref) join osp_private.document_extractions extraction on extraction.organization_id = snapshot.organization_id and extraction.case_id = snapshot.case_id and extraction.id::text = ref->>'extractionId' join osp_private.document_versions version on version.organization_id = extraction.organization_id and version.id = extraction.source_version_id and version.content_type in (${PDF}, ${DOCX}) join lateral (select count(*)::integer as candidate_count from osp_private.supplier_form_mappings possible where possible.organization_id = snapshot.organization_id and possible.case_id = snapshot.case_id and possible.extraction_id = extraction.id and ((possible.id::text = ref->>'mappingId' and possible.version::text = ref->>'mappingVersion' and possible.after_sha256 = ref->>'mappingSha256') or (possible.before_sha256 = ref->>'mappingSha256' and possible.version = (ref->>'mappingVersion')::integer + 1))) candidate on true join lateral (select possible.* from osp_private.supplier_form_mappings possible where possible.organization_id = snapshot.organization_id and possible.case_id = snapshot.case_id and possible.extraction_id = extraction.id and ((possible.id::text = ref->>'mappingId' and possible.version::text = ref->>'mappingVersion' and possible.after_sha256 = ref->>'mappingSha256') or (possible.before_sha256 = ref->>'mappingSha256' and possible.version = (ref->>'mappingVersion')::integer + 1)) order by possible.version desc, possible.id limit 1) mapping on true where case_record.organization_id = ${organizationId} and case_record.id = ${caseId} order by version.id, mapping.id`;
  return parseNativeTargetReviewRows(rows as unknown as TargetRow[]);
}

export function createNativeArtifactTargetsStore(options: {
  sql: SqlPort;
}): NativeArtifactTargetsStore {
  const store: NativeArtifactTargetsStore = {
    load: async ({ organizationId, caseId }) =>
      await withOrganizationTransaction(
        options.sql,
        organizationId,
        async (tx) => {
          return await loadNativeArtifactTargetReviews(tx, {
            organizationId,
            caseId,
          });
        },
      ),
    record: async (input, identity) => {
      if (
        !UUID.test(input.caseId) || !UUID.test(input.mappingId) ||
        !UUID.test(input.expectedSourceVersionId) ||
        !SHA.test(input.expectedMappingSha256) ||
        !SHA.test(input.expectedSourceSha256) ||
        !KEY.test(input.idempotencyKey) ||
        !Number.isSafeInteger(input.expectedMappingVersion) ||
        input.expectedMappingVersion < 1 ||
        identity.identity.organization.length < 1
      ) throw new Error("INVALID_INPUT");
      const permission = identity.permissions.find((value) =>
        value === "osp:operate"
      );
      if (!permission || !identity.identity.emailVerified) {
        throw new Error("APPROVAL_FORBIDDEN");
      }
      const contentType = await withOrganizationTransaction(
        options.sql,
        identity.identity.organization,
        async (tx) => {
          const rows =
            await tx`select version.content_type from osp_private.supplier_form_mappings mapping join osp_private.document_extractions extraction on extraction.organization_id = mapping.organization_id and extraction.id = mapping.extraction_id join osp_private.document_versions version on version.organization_id = extraction.organization_id and version.id = extraction.source_version_id where mapping.organization_id = ${identity.identity.organization} and mapping.case_id = ${input.caseId} and mapping.id = ${input.mappingId} and mapping.version = ${input.expectedMappingVersion} and mapping.after_sha256 = ${input.expectedMappingSha256} and version.id = ${input.expectedSourceVersionId} and version.source_sha256 = ${input.expectedSourceSha256} limit 2`;
          if (
            rows.length !== 1 ||
            (rows[0].content_type !== PDF && rows[0].content_type !== DOCX)
          ) {
            throw new Error("VERSION_CONFLICT");
          }
          return rows[0].content_type as typeof PDF | typeof DOCX;
        },
      );
      const targets = validateNativeTargetSet(contentType, input.targets);
      return await withOrganizationTransaction(
        options.sql,
        identity.identity.organization,
        async (tx) => {
          await tx`select pg_advisory_xact_lock(hashtextextended(${
            identity.identity.organization + ":native-targets:" +
            input.idempotencyKey
          }, 0))`;
          const replay =
            await tx`select mapping.id::text as mapping_id, mapping.version as mapping_version, mapping.after_sha256 as mapping_sha256, mapping.review_decision_id::text as mapping_review_decision_id, case_record.state as case_state, case_record.aggregate_version as case_version from osp_private.supplier_form_mappings mapping join osp_private.review_decisions decision on decision.organization_id = mapping.organization_id and decision.id = mapping.review_decision_id and decision.subject_id = mapping.id join osp_private.customer_registration_cases case_record on case_record.organization_id = mapping.organization_id and case_record.id = mapping.case_id where mapping.organization_id = ${identity.identity.organization} and mapping.case_id = ${input.caseId} and mapping.version = ${
              input.expectedMappingVersion + 1
            } and mapping.before_sha256 = ${input.expectedMappingSha256} and mapping.mapping_json->'artifactTargetSource' = jsonb_build_object('sourceVersionId', ${input.expectedSourceVersionId}, 'sourceSha256', ${input.expectedSourceSha256}) and mapping.mapping_json->'artifactTargets' = ${
              JSON.stringify(targets)
            }::jsonb and decision.reviewer_subject = ${identity.identity.subject} and case_record.state = 'preparing' limit 2`;
          if (replay.length === 1) return receipt(replay[0], true);
          if (replay.length > 1) throw new Error("IDEMPOTENCY_CONFLICT");
          const rows =
            await tx`select * from osp_private.record_reviewed_native_artifact_targets_command(${identity.identity.organization}, ${input.caseId}, ${input.mappingId}, ${input.expectedMappingVersion}, ${input.expectedMappingSha256}, ${input.expectedSourceVersionId}, ${input.expectedSourceSha256}, ${
              JSON.stringify(targets)
            }::jsonb, ${identity.identity.subject}, ${permission}, ${identity.identity.email}, ${identity.permissions}, ${"operations_reviewer"}, ${identity.authorizationSessionId}, ${identity.authorizationSessionIssuedAt})`;
          if (rows.length !== 1) throw new Error("VERSION_CONFLICT");
          return receipt(rows[0], false);
        },
      );
    },
  };
  return Object.freeze(store);
}

function receipt(
  row: Record<string, unknown>,
  replayed: boolean,
): NativeArtifactTargetReceipt {
  const result = {
    mappingId: String(row.mapping_id),
    mappingVersion: positiveInteger(row.mapping_version),
    mappingSha256: String(row.mapping_sha256),
    mappingReviewDecisionId: String(row.mapping_review_decision_id),
    caseState: row.case_state,
    caseVersion: positiveInteger(row.case_version),
    replayed,
  };
  if (
    !UUID.test(result.mappingId) || !SHA.test(result.mappingSha256) ||
    !UUID.test(result.mappingReviewDecisionId) ||
    result.caseState !== "preparing"
  ) throw new Error("NATIVE_TARGET_RECEIPT_INVALID");
  return Object.freeze(result as NativeArtifactTargetReceipt);
}

export function createPostgresNativeArtifactTargetsStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): NativeArtifactTargetsStore {
  const sql =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      options.databaseUrl,
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-native-artifact-targets",
          statement_timeout: "3000",
        },
      },
    ) as SqlPort;
  return createNativeArtifactTargetsStore({ sql });
}
