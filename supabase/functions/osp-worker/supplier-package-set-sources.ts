import type { SqlPort } from "../_shared/osp/database-context.ts";
import type { SupplierPackageJobInput } from "./supplier-package-job.ts";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12" as const;
const PDF = "application/pdf" as const;
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
type PackageContentType = typeof XLSX | typeof XLSM | typeof PDF | typeof DOCX;
type SourceContentType = PackageContentType | typeof XLSM;

export type SourceRow = {
  snapshot_sha256: string;
  source_version_id: string;
  source_sha256: string;
  source_bucket_id: string;
  source_object_key: string;
  content_type: SourceContentType;
  mapping_decision_id: string;
  mappings: unknown;
};

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function nativeMappingsAreExact(row: SourceRow): boolean {
  if (!Array.isArray(row.mappings) || !row.mappings.length) return false;
  const valid = row.mappings.every((candidate) => {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    ) {
      return false;
    }
    const mapping = candidate as Record<string, unknown>;
    if (
      mapping.mappingDecisionId !== row.mapping_decision_id ||
      typeof mapping.canonicalFieldId !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(mapping.canonicalFieldId) ||
      !["string", "number", "boolean"].includes(typeof mapping.value)
    ) return false;
    if (row.content_type === PDF && mapping.kind === "acroform") {
      return hasExactKeys(mapping, [
        "kind",
        "canonicalFieldId",
        "fieldName",
        "mappingDecisionId",
        "value",
      ]) && typeof mapping.fieldName === "string" &&
        mapping.fieldName.trim() === mapping.fieldName &&
        mapping.fieldName.length >= 1 && mapping.fieldName.length <= 256;
    }
    if (row.content_type === PDF && mapping.kind === "overlay") {
      return hasExactKeys(mapping, [
        "kind",
        "canonicalFieldId",
        "page",
        "x",
        "y",
        "width",
        "height",
        "fontSize",
        "mappingDecisionId",
        "value",
      ]) && Number.isSafeInteger(mapping.page) && Number(mapping.page) >= 1 &&
        [mapping.x, mapping.y].every((value) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0
        ) && [mapping.width, mapping.height, mapping.fontSize].every((value) =>
          typeof value === "number" && Number.isFinite(value) && value > 0
        ) && Number(mapping.fontSize) <= Number(mapping.height) &&
        typeof mapping.value === "string" && !mapping.value.includes("\n");
    }
    return row.content_type === DOCX && mapping.kind === "content_control" &&
      hasExactKeys(mapping, [
        "kind",
        "canonicalFieldId",
        "targetTag",
        "mappingDecisionId",
        "value",
      ]) && typeof mapping.targetTag === "string" &&
      /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(mapping.targetTag);
  });
  if (!valid) return false;
  const mappings = row.mappings as Record<string, unknown>[];
  const canonicalIds = new Set(
    mappings.map((mapping) => mapping.canonicalFieldId),
  );
  const targets = new Set(
    mappings.map((mapping) =>
      mapping.kind === "acroform"
        ? `acroform:${mapping.fieldName}`
        : mapping.kind === "content_control"
        ? `content_control:${mapping.targetTag}`
        : `overlay:${mapping.page}:${mapping.x}:${mapping.y}:${mapping.width}:${mapping.height}:${mapping.fontSize}`
    ),
  );
  return canonicalIds.size === mappings.length &&
    targets.size === mappings.length;
}

/** Resolve all reviewed originals. Fallback is per source, never per request.
 * These are the existing runtime SQL predicates, preserving snapshot/mapping
 * references. No arbitrary file path, browser mapping, or LLM payload is accepted.
 */
export async function loadReviewedPackageSetSources(
  tx: SqlPort,
  input: SupplierPackageJobInput,
): Promise<SourceRow[]> {
  const expected =
    await tx`select distinct version.id::text as source_version_id from osp_private.case_package_input_snapshots snapshot join osp_private.customer_registration_cases case_record on case_record.organization_id = snapshot.organization_id and case_record.id = snapshot.case_id and case_record.state = 'operations_review' and case_record.aggregate_version = snapshot.case_version cross join lateral jsonb_array_elements(snapshot.mapping_refs) item(ref) join osp_private.document_extractions extraction on extraction.organization_id = snapshot.organization_id and extraction.case_id = snapshot.case_id and extraction.id = any(snapshot.extraction_ids) and extraction.id::text = ref->>'extractionId' join osp_private.document_versions version on version.organization_id = snapshot.organization_id and version.id = extraction.source_version_id and version.id = any(snapshot.document_version_ids) where snapshot.organization_id = ${input.organizationId} and snapshot.case_id = ${input.caseId} and snapshot.id = ${input.snapshotId}`;
  const primary =
    await tx`select snapshot.canonical_sha256 as snapshot_sha256, version.id::text as source_version_id, version.source_sha256, version.bucket_id as source_bucket_id, version.opaque_object_key as source_object_key, version.content_type, mapping.review_decision_id::text as mapping_decision_id, jsonb_agg(jsonb_build_object('mappingDecisionId', mapping.review_decision_id::text, 'reviewedTarget', target, 'fieldKey', field.field_key, 'definition', field.definition_json, 'value', instance.values_json->field.field_key) order by target->>'sheet', target->>'cell', field.field_key) as mappings from osp_private.case_package_input_snapshots snapshot join osp_private.customer_registration_cases case_record on case_record.organization_id = snapshot.organization_id and case_record.id = snapshot.case_id and case_record.state = 'operations_review' and case_record.aggregate_version = snapshot.case_version join osp_private.case_form_instances instance on instance.organization_id = snapshot.organization_id and instance.case_id = snapshot.case_id and instance.id = snapshot.form_instance_id and instance.version = snapshot.form_instance_version join osp_private.supplier_form_mappings mapping on mapping.organization_id = snapshot.organization_id and mapping.case_id = snapshot.case_id and mapping.template_version_id = snapshot.template_version_id and mapping.extraction_id = any(snapshot.extraction_ids) and mapping.status in ('accepted', 'corrected') and mapping.review_decision_id = any(snapshot.review_decision_ids) and exists (select 1 from jsonb_array_elements(snapshot.mapping_refs) item(ref) where ref->>'mappingId' = mapping.id::text and ref->>'mappingVersion' = mapping.version::text and ref->>'mappingSha256' = mapping.after_sha256 and ref->>'extractionId' = mapping.extraction_id::text and ref->>'reviewDecisionId' = mapping.review_decision_id::text) join osp_private.document_extractions extraction on extraction.organization_id = snapshot.organization_id and extraction.case_id = snapshot.case_id and extraction.id = mapping.extraction_id and extraction.status = 'reviewed' join osp_private.document_versions version on version.organization_id = snapshot.organization_id and version.id = extraction.source_version_id and version.id = any(snapshot.document_version_ids) and version.document_type = 'supplier_requirement' and version.status = 'approved' and version.content_type in (${XLSX}, ${XLSM}) cross join lateral jsonb_array_elements(mapping.mapping_json->'artifactTargets') item(target) left join osp_private.form_fields field on field.organization_id = snapshot.organization_id and field.template_version_id = snapshot.template_version_id and ((target ? 'fieldKey' and field.field_key = target->>'fieldKey') or (not (target ? 'fieldKey') and field.definition_json->>'canonicalFieldId' = target->>'canonicalFieldId')) where snapshot.organization_id = ${input.organizationId} and snapshot.case_id = ${input.caseId} and snapshot.id = ${input.snapshotId} and jsonb_typeof(mapping.mapping_json->'artifactTargets') = 'array' group by snapshot.canonical_sha256, version.id, version.source_sha256, version.bucket_id, version.opaque_object_key, version.content_type, mapping.review_decision_id` as unknown as SourceRow[];
  const fallback =
    await tx`select snapshot.canonical_sha256 as snapshot_sha256, version.id::text as source_version_id, version.source_sha256, version.bucket_id as source_bucket_id, version.opaque_object_key as source_object_key, version.content_type, mapping.review_decision_id::text as mapping_decision_id, jsonb_agg(jsonb_build_object('mappingDecisionId', mapping.review_decision_id::text, 'canonicalFieldId', field.definition_json->>'canonicalFieldId', 'sheet', evidence->>'sheet', 'cell', evidence->>'cellRange', 'value', instance.values_json->field.field_key) order by evidence->>'sheet', evidence->>'cellRange', field.field_key) as mappings from osp_private.case_package_input_snapshots snapshot join osp_private.customer_registration_cases case_record on case_record.organization_id = snapshot.organization_id and case_record.id = snapshot.case_id and case_record.state = 'operations_review' and case_record.aggregate_version = snapshot.case_version join osp_private.case_form_instances instance on instance.organization_id = snapshot.organization_id and instance.case_id = snapshot.case_id and instance.id = snapshot.form_instance_id and instance.version = snapshot.form_instance_version join osp_private.supplier_form_mappings mapping on mapping.organization_id = snapshot.organization_id and mapping.case_id = snapshot.case_id and mapping.template_version_id = snapshot.template_version_id and mapping.extraction_id = any(snapshot.extraction_ids) and mapping.status in ('accepted', 'corrected') and mapping.review_decision_id = any(snapshot.review_decision_ids) and exists (select 1 from jsonb_array_elements(snapshot.mapping_refs) item(ref) where ref->>'mappingId' = mapping.id::text and ref->>'mappingVersion' = mapping.version::text and ref->>'mappingSha256' = mapping.after_sha256 and ref->>'extractionId' = mapping.extraction_id::text and ref->>'reviewDecisionId' = mapping.review_decision_id::text) join osp_private.document_extractions extraction on extraction.organization_id = snapshot.organization_id and extraction.case_id = snapshot.case_id and extraction.id = mapping.extraction_id and extraction.status = 'reviewed' join osp_private.document_versions version on version.organization_id = snapshot.organization_id and version.id = extraction.source_version_id and version.id = any(snapshot.document_version_ids) and version.document_type = 'supplier_requirement' and version.status = 'approved' and version.content_type = ${XLSX} join osp_private.extraction_fields extracted on extracted.organization_id = snapshot.organization_id and extracted.extraction_id = extraction.id join osp_private.form_fields field on field.organization_id = snapshot.organization_id and field.template_version_id = snapshot.template_version_id and field.definition_json->>'canonicalFieldId' = extracted.field_key cross join lateral jsonb_array_elements(extracted.evidence_json) item(evidence) where snapshot.organization_id = ${input.organizationId} and snapshot.case_id = ${input.caseId} and snapshot.id = ${input.snapshotId} and evidence->>'kind' = 'xlsx_cell' and evidence->>'sourceVersionId' = version.id::text and evidence->>'cellRange' ~ '^[A-Z]{1,3}[1-9][0-9]*$' and jsonb_typeof(instance.values_json->field.field_key) in ('string', 'number', 'boolean') and exists (select 1 from jsonb_array_elements(snapshot.field_evidence_refs) item(ref) where ref->>'fieldId' = extracted.id::text and ref->>'extractionId' = extracted.extraction_id::text and ref->>'kind' = evidence->>'kind' and ref->>'sourceVersionId' = evidence->>'sourceVersionId' and ref->>'rawEvidenceHash' = evidence->>'rawEvidenceHash') group by snapshot.canonical_sha256, version.id, version.source_sha256, version.bucket_id, version.opaque_object_key, version.content_type, mapping.review_decision_id` as unknown as SourceRow[];
  const native =
    await tx`select snapshot.canonical_sha256 as snapshot_sha256, version.id::text as source_version_id, version.source_sha256, version.bucket_id as source_bucket_id, version.opaque_object_key as source_object_key, version.content_type, mapping.review_decision_id::text as mapping_decision_id, jsonb_agg(target || jsonb_build_object('mappingDecisionId', mapping.review_decision_id::text, 'value', instance.values_json->field.field_key) order by target->>'canonicalFieldId', target->>'kind') as mappings from osp_private.case_package_input_snapshots snapshot join osp_private.customer_registration_cases case_record on case_record.organization_id = snapshot.organization_id and case_record.id = snapshot.case_id and case_record.state = 'operations_review' and case_record.aggregate_version = snapshot.case_version join osp_private.case_form_instances instance on instance.organization_id = snapshot.organization_id and instance.case_id = snapshot.case_id and instance.id = snapshot.form_instance_id and instance.version = snapshot.form_instance_version join osp_private.supplier_form_mappings mapping on mapping.organization_id = snapshot.organization_id and mapping.case_id = snapshot.case_id and mapping.template_version_id = snapshot.template_version_id and mapping.extraction_id = any(snapshot.extraction_ids) and mapping.status in ('accepted', 'corrected') and mapping.review_decision_id = any(snapshot.review_decision_ids) and mapping.mapping_json->>'artifactTargetSchemaVersion' = '1' and exists (select 1 from jsonb_array_elements(snapshot.mapping_refs) item(ref) where ref->>'mappingId' = mapping.id::text and ref->>'mappingVersion' = mapping.version::text and ref->>'mappingSha256' = mapping.after_sha256 and ref->>'extractionId' = mapping.extraction_id::text and ref->>'reviewDecisionId' = mapping.review_decision_id::text) join osp_private.review_decisions decision on decision.organization_id = mapping.organization_id and decision.case_id = mapping.case_id and decision.id = mapping.review_decision_id and decision.subject_kind = 'form_mapping' and decision.subject_id = mapping.id and decision.decision = mapping.status and decision.before_sha256 = mapping.before_sha256 and decision.after_sha256 = mapping.after_sha256 join osp_private.document_extractions extraction on extraction.organization_id = snapshot.organization_id and extraction.case_id = snapshot.case_id and extraction.id = mapping.extraction_id and extraction.status = 'reviewed' join osp_private.document_versions version on version.organization_id = snapshot.organization_id and version.id = extraction.source_version_id and version.id = any(snapshot.document_version_ids) and version.document_type = 'supplier_requirement' and version.status = 'approved' and version.content_type in (${PDF}, ${DOCX}) and mapping.mapping_json->'artifactTargetSource'->>'sourceVersionId' = version.id::text and mapping.mapping_json->'artifactTargetSource'->>'sourceSha256' = version.source_sha256 cross join lateral jsonb_array_elements(mapping.mapping_json->'artifactTargets') item(target) join osp_private.form_fields field on field.organization_id = snapshot.organization_id and field.template_version_id = snapshot.template_version_id and field.definition_json->>'canonicalFieldId' = target->>'canonicalFieldId' where snapshot.organization_id = ${input.organizationId} and snapshot.case_id = ${input.caseId} and snapshot.id = ${input.snapshotId} and jsonb_typeof(mapping.mapping_json->'artifactTargets') = 'array' and jsonb_typeof(instance.values_json->field.field_key) in ('string', 'number', 'boolean') group by snapshot.canonical_sha256, version.id, version.source_sha256, version.bucket_id, version.opaque_object_key, version.content_type, mapping.review_decision_id` as unknown as SourceRow[];
  const primaryIds = new Set(primary.map((row) => row.source_version_id));
  const rows = [
    ...primary,
    ...fallback.filter((row) => !primaryIds.has(row.source_version_id)),
    ...native,
  ];
  if (native.some((row) => !nativeMappingsAreExact(row))) {
    throw new Error("SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT");
  }
  // One reviewed mapping decision per original is deliberately retained for now:
  // conflicting parallel decisions must not be silently merged or selected.
  const unique = new Set(rows.map((row) => row.source_version_id));
  if (
    rows.length !== unique.size || expected.length !== unique.size ||
    expected.some((row) => !unique.has(String(row.source_version_id)))
  ) {
    throw new Error("SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT");
  }
  return rows.sort((a, b) =>
    a.source_version_id < b.source_version_id ? -1 : 1
  );
}
