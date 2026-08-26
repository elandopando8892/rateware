import { createHash } from "node:crypto";

import { assertExtractedField, type ExtractedField, extractionContractPatterns } from "./extraction-contracts.ts";
import { assertOperationsReviewComplete, assertReviewDecision, assertReviewDocumentStatus, type ReviewDecision, type ReviewDocumentStatus } from "./review-decision.ts";

export type PackageMappingRef = {
  mappingId: string;
  mappingVersion: number;
  mappingSha256: string;
  extractionId: string;
  reviewDecisionId: string;
};

export type PackageFieldEvidenceRef = {
  fieldId: string;
  extractionId: string;
  kind: "pdf_region" | "xlsx_cell";
  sourceVersionId: string;
  rawEvidenceHash: string;
};

export type PackageInputSnapshotPayload = {
  organizationId: string;
  caseId: string;
  caseVersion: number;
  documentVersionIds: readonly string[];
  extractionIds: readonly string[];
  templateVersionId: string;
  formInstanceId: string;
  formInstanceVersion: number;
  reviewDecisionIds: readonly string[];
  mappingRefs: readonly PackageMappingRef[];
  fieldEvidenceRefs: readonly PackageFieldEvidenceRef[];
};

export type PackageInputSnapshot = PackageInputSnapshotPayload & {
  canonicalSha256: string;
};

export type PackageSnapshotBuildInput = {
  payload: PackageInputSnapshotPayload;
  currentCaseVersion: number;
  template: {
    id: string;
    organizationId: string;
    status: "draft" | "published";
  };
  formInstance: {
    id: string;
    organizationId: string;
    caseId: string;
    templateVersionId: string;
    version: number;
  };
  extractions: readonly {
    id: string;
    organizationId: string;
    caseId: string;
    sourceVersionId: string;
    status: "review_required" | "reviewed" | "failed";
    fieldIds: readonly string[];
  }[];
  mappings: readonly {
    id: string;
    organizationId: string;
    caseId: string;
    templateVersionId: string;
    extractionId: string;
    version: number;
    mappingSha256: string;
    reviewDecisionId: string;
    status: "accepted" | "corrected" | "rejected" | "unresolved";
    beforeSha256: string;
    afterSha256: string;
  }[];
  fields: readonly ExtractedField[];
  decisions: readonly ReviewDecision[];
  documents: readonly ReviewDocumentStatus[];
  now: Date;
};

const REQUIRED_QUARTERLY_TYPES = [
  "proof_of_address",
  "sat_compliance_opinion",
  "tax_status_certificate",
  "bank_statement",
] as const;

function requireRecord(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) throw new Error(code);
  return record;
}

function requireUuid(value: unknown, code: string): asserts value is string {
  if (
    typeof value !== "string" || !extractionContractPatterns.uuid.test(value)
  ) throw new Error(code);
}

function requireSha(value: unknown, code: string): asserts value is string {
  if (
    typeof value !== "string" || !extractionContractPatterns.sha256.test(value)
  ) throw new Error(code);
}

function requireVersion(value: unknown, code: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2147483647) {
    throw new Error(code);
  }
}

function canonicalIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`SNAPSHOT_${label}_IDS_INVALID`);
  for (const item of value) requireUuid(item, `SNAPSHOT_${label}_ID_INVALID`);
  const sorted = [...value].sort((left, right) => left.localeCompare(right));
  if (new Set(sorted).size !== sorted.length) {
    throw new Error(`SNAPSHOT_${label}_IDS_DUPLICATE`);
  }
  return sorted;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalMappingRefs(value: unknown): PackageMappingRef[] {
  if (!Array.isArray(value)) throw new Error("SNAPSHOT_MAPPING_REFS_INVALID");
  const refs = value.map((candidate) => {
    const ref = requireRecord(candidate, [
      "mappingId",
      "mappingVersion",
      "mappingSha256",
      "extractionId",
      "reviewDecisionId",
    ], "SNAPSHOT_MAPPING_REF_INVALID");
    requireUuid(ref.mappingId, "SNAPSHOT_MAPPING_ID_INVALID");
    requireVersion(ref.mappingVersion, "SNAPSHOT_MAPPING_VERSION_INVALID");
    requireSha(ref.mappingSha256, "SNAPSHOT_MAPPING_HASH_INVALID");
    requireUuid(ref.extractionId, "SNAPSHOT_EXTRACTION_ID_INVALID");
    requireUuid(ref.reviewDecisionId, "SNAPSHOT_REVIEW_DECISION_ID_INVALID");
    return ref as PackageMappingRef;
  }).sort((left, right) => left.mappingId.localeCompare(right.mappingId));
  if (new Set(refs.map((ref) => ref.mappingId)).size !== refs.length) {
    throw new Error("SNAPSHOT_MAPPING_REFS_DUPLICATE");
  }
  return refs;
}

function canonicalFieldEvidenceRefs(value: unknown): PackageFieldEvidenceRef[] {
  if (!Array.isArray(value)) {
    throw new Error("SNAPSHOT_FIELD_EVIDENCE_REFS_INVALID");
  }
  const refs = value.map((candidate) => {
    const ref = requireRecord(candidate, [
      "fieldId",
      "extractionId",
      "kind",
      "sourceVersionId",
      "rawEvidenceHash",
    ], "SNAPSHOT_FIELD_EVIDENCE_REF_INVALID");
    requireUuid(ref.fieldId, "SNAPSHOT_FIELD_ID_INVALID");
    requireUuid(ref.extractionId, "SNAPSHOT_EXTRACTION_ID_INVALID");
    requireUuid(ref.sourceVersionId, "SNAPSHOT_DOCUMENT_ID_INVALID");
    requireSha(ref.rawEvidenceHash, "SNAPSHOT_FIELD_EVIDENCE_HASH_INVALID");
    if (ref.kind !== "pdf_region" && ref.kind !== "xlsx_cell") {
      throw new Error("SNAPSHOT_FIELD_EVIDENCE_KIND_INVALID");
    }
    return ref as PackageFieldEvidenceRef;
  }).sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
  if (new Set(refs.map(evidenceKey)).size !== refs.length) {
    throw new Error("SNAPSHOT_FIELD_EVIDENCE_REFS_DUPLICATE");
  }
  return refs;
}

function evidenceKey(ref: PackageFieldEvidenceRef): string {
  return `${ref.fieldId}|${ref.extractionId}|${ref.kind}|${ref.sourceVersionId}|${ref.rawEvidenceHash}`;
}

function canonicalPayload(value: unknown): PackageInputSnapshotPayload {
  const input = requireRecord(value, [
    "organizationId",
    "caseId",
    "caseVersion",
    "documentVersionIds",
    "extractionIds",
    "templateVersionId",
    "formInstanceId",
    "formInstanceVersion",
    "reviewDecisionIds",
    "mappingRefs",
    "fieldEvidenceRefs",
  ], "SNAPSHOT_PAYLOAD_INVALID");
  requireUuid(input.organizationId, "SNAPSHOT_ORGANIZATION_INVALID");
  requireUuid(input.caseId, "SNAPSHOT_CASE_INVALID");
  requireVersion(input.caseVersion, "SNAPSHOT_CASE_VERSION_INVALID");
  requireUuid(input.templateVersionId, "SNAPSHOT_TEMPLATE_VERSION_INVALID");
  requireUuid(input.formInstanceId, "SNAPSHOT_FORM_INSTANCE_INVALID");
  requireVersion(input.formInstanceVersion, "SNAPSHOT_FORM_VERSION_INVALID");
  return {
    organizationId: input.organizationId,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    documentVersionIds: canonicalIds(input.documentVersionIds, "DOCUMENT"),
    extractionIds: canonicalIds(input.extractionIds, "EXTRACTION"),
    templateVersionId: input.templateVersionId,
    formInstanceId: input.formInstanceId,
    formInstanceVersion: input.formInstanceVersion,
    reviewDecisionIds: canonicalIds(input.reviewDecisionIds, "REVIEW_DECISION"),
    mappingRefs: canonicalMappingRefs(input.mappingRefs),
    fieldEvidenceRefs: canonicalFieldEvidenceRefs(input.fieldEvidenceRefs),
  };
}

export function canonicalPackageInputSnapshotText(value: unknown): string {
  const input = canonicalPayload(value);
  return [
    "osp-package-input-snapshot-v2",
    `organizationId=${input.organizationId}`,
    `caseId=${input.caseId}`,
    `caseVersion=${input.caseVersion}`,
    ...input.documentVersionIds.map((id) => `documentVersionId=${id}`),
    ...input.extractionIds.map((id) => `extractionId=${id}`),
    `templateVersionId=${input.templateVersionId}`,
    `formInstanceId=${input.formInstanceId}`,
    `formInstanceVersion=${input.formInstanceVersion}`,
    ...input.reviewDecisionIds.map((id) => `reviewDecisionId=${id}`),
    ...input.mappingRefs.map((ref) => `mappingRef=${ref.mappingId}|${ref.mappingVersion}|${ref.mappingSha256}|${ref.extractionId}|${ref.reviewDecisionId}`),
    ...input.fieldEvidenceRefs.map((ref) => `fieldEvidenceRef=${evidenceKey(ref)}`),
  ].join("\n");
}

export function hashPackageInputSnapshot(value: unknown): string {
  return createHash("sha256").update(
    canonicalPackageInputSnapshotText(value),
    "utf8",
  ).digest("hex");
}

function assertDocuments(
  input: PackageSnapshotBuildInput,
  payload: PackageInputSnapshotPayload,
): Set<string> {
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
    throw new Error("SNAPSHOT_CLOCK_INVALID");
  }
  const actual: string[] = [];
  const decisionIds = new Set<string>();
  const typeCounts = new Map<string, number>();
  for (const document of input.documents) {
    assertReviewDocumentStatus(document);
    if (!document.eligible) {
      const findings = {
        missing: "REVIEW_DOCUMENT_MISSING",
        unapproved: "REVIEW_DOCUMENT_UNAPPROVED",
        expired: "REVIEW_DOCUMENT_EXPIRED",
        superseded: "REVIEW_DOCUMENT_SUPERSEDED",
        invalid: "REVIEW_DOCUMENT_INVALID",
      } as const;
      throw new Error(findings[document.reason] ?? "REVIEW_DOCUMENT_INVALID");
    }
    if (
      document.organizationId !== payload.organizationId ||
      (document.documentType === "supplier_requirement" ? document.caseId !== payload.caseId : document.caseId !== null && document.caseId !== payload.caseId)
    ) throw new Error("SNAPSHOT_DOCUMENT_SCOPE_MISMATCH");
    if (document.documentType !== "supplier_requirement") {
      if (document.validFrom === null || document.validUntil === null) {
        throw new Error("REVIEW_DOCUMENT_INVALID");
      }
      const utcSnapshotDate = input.now.toISOString().slice(0, 10);
      if (utcSnapshotDate < document.validFrom) {
        throw new Error("REVIEW_DOCUMENT_NOT_CURRENT");
      }
      if (utcSnapshotDate >= document.validUntil) throw new Error("REVIEW_DOCUMENT_EXPIRED");
      if (!document.isLatestCurrent) throw new Error("REVIEW_DOCUMENT_NOT_LATEST");
    }
    actual.push(document.documentVersionId);
    decisionIds.add(document.reviewDecisionId);
    typeCounts.set(
      document.documentType,
      (typeCounts.get(document.documentType) ?? 0) + 1,
    );
  }
  if (
    !sameCanonical(canonicalIds(actual, "DOCUMENT"), payload.documentVersionIds)
  ) throw new Error("SNAPSHOT_DOCUMENT_SET_MISMATCH");
  if (REQUIRED_QUARTERLY_TYPES.some((type) => typeCounts.get(type) !== 1)) {
    throw new Error("SNAPSHOT_QUARTERLY_DOCUMENT_REQUIRED");
  }
  return decisionIds;
}

function assertExtractionsAndFields(
  input: PackageSnapshotBuildInput,
  payload: PackageInputSnapshotPayload,
): PackageFieldEvidenceRef[] {
  const documentIds = new Set(payload.documentVersionIds);
  const extractionIds: string[] = [];
  const expectedFields = new Map<string, string[]>();
  const extractionSources = new Map<string, string>();
  for (const candidate of input.extractions) {
    const extraction = requireRecord(candidate, [
      "id",
      "organizationId",
      "caseId",
      "sourceVersionId",
      "status",
      "fieldIds",
    ], "SNAPSHOT_EXTRACTION_INVALID");
    requireUuid(extraction.id, "SNAPSHOT_EXTRACTION_ID_INVALID");
    requireUuid(extraction.sourceVersionId, "SNAPSHOT_DOCUMENT_ID_INVALID");
    if (
      extraction.organizationId !== payload.organizationId ||
      extraction.caseId !== payload.caseId
    ) throw new Error("SNAPSHOT_EXTRACTION_SCOPE_MISMATCH");
    if (extraction.status !== "reviewed") {
      throw new Error("SNAPSHOT_EXTRACTION_NOT_REVIEWED");
    }
    if (!documentIds.has(extraction.sourceVersionId)) {
      throw new Error("SNAPSHOT_EXTRACTION_SOURCE_MISMATCH");
    }
    const fieldIds = canonicalIds(extraction.fieldIds, "FIELD");
    if (fieldIds.length === 0) {
      throw new Error("SNAPSHOT_EXTRACTION_FIELDS_REQUIRED");
    }
    extractionIds.push(extraction.id);
    expectedFields.set(extraction.id, fieldIds);
    extractionSources.set(extraction.id, extraction.sourceVersionId);
  }
  if (
    !sameCanonical(
      canonicalIds(extractionIds, "EXTRACTION"),
      payload.extractionIds,
    )
  ) throw new Error("SNAPSHOT_EXTRACTION_SET_MISMATCH");
  const actualFields = new Map<string, string[]>();
  const evidenceRefs: PackageFieldEvidenceRef[] = [];
  for (const field of input.fields) {
    assertExtractedField(field);
    if (
      field.organizationId !== payload.organizationId ||
      field.caseId !== payload.caseId || !expectedFields.has(field.extractionId)
    ) throw new Error("SNAPSHOT_EXTRACTION_FIELD_MISMATCH");
    const expectedSource = extractionSources.get(field.extractionId);
    for (const locator of field.evidence) {
      if (locator.sourceVersionId !== expectedSource) {
        throw new Error("SNAPSHOT_EVIDENCE_SOURCE_MISMATCH");
      }
      evidenceRefs.push({
        fieldId: field.id,
        extractionId: field.extractionId,
        kind: locator.kind,
        sourceVersionId: locator.sourceVersionId,
        rawEvidenceHash: locator.rawEvidenceHash,
      });
    }
    const ids = actualFields.get(field.extractionId) ?? [];
    ids.push(field.id);
    actualFields.set(field.extractionId, ids);
  }
  for (const extractionId of payload.extractionIds) {
    const actual = canonicalIds(actualFields.get(extractionId) ?? [], "FIELD");
    if (!sameCanonical(actual, expectedFields.get(extractionId) ?? [])) {
      throw new Error("SNAPSHOT_EXTRACTION_FIELD_MISMATCH");
    }
  }
  const canonical = canonicalFieldEvidenceRefs(evidenceRefs);
  if (!sameCanonical(canonical, payload.fieldEvidenceRefs)) {
    throw new Error("SNAPSHOT_FIELD_EVIDENCE_SET_MISMATCH");
  }
  return canonical;
}

function assertMappings(
  input: PackageSnapshotBuildInput,
  payload: PackageInputSnapshotPayload,
  decisions: Map<string, ReviewDecision>,
) {
  if (input.mappings.length === 0) {
    throw new Error("SNAPSHOT_MAPPINGS_REQUIRED");
  }
  const extractionIds = new Set(payload.extractionIds);
  const mappedExtractions = new Set<string>();
  const decisionIds = new Set<string>();
  const mappingIds = new Set<string>();
  const refs: PackageMappingRef[] = [];
  for (const candidate of input.mappings) {
    const mapping = requireRecord(candidate, [
      "id",
      "organizationId",
      "caseId",
      "templateVersionId",
      "extractionId",
      "version",
      "mappingSha256",
      "reviewDecisionId",
      "status",
      "beforeSha256",
      "afterSha256",
    ], "SNAPSHOT_MAPPING_INVALID");
    requireUuid(mapping.id, "SNAPSHOT_MAPPING_ID_INVALID");
    requireUuid(mapping.extractionId, "SNAPSHOT_EXTRACTION_ID_INVALID");
    requireUuid(
      mapping.reviewDecisionId,
      "SNAPSHOT_REVIEW_DECISION_ID_INVALID",
    );
    requireVersion(mapping.version, "SNAPSHOT_MAPPING_VERSION_INVALID");
    requireSha(mapping.mappingSha256, "SNAPSHOT_MAPPING_HASH_INVALID");
    requireSha(mapping.beforeSha256, "SNAPSHOT_MAPPING_HASH_INVALID");
    requireSha(mapping.afterSha256, "SNAPSHOT_MAPPING_HASH_INVALID");
    if (mapping.mappingSha256 !== mapping.afterSha256) {
      throw new Error("SNAPSHOT_MAPPING_HASH_MISMATCH");
    }
    if (
      mapping.organizationId !== payload.organizationId ||
      mapping.caseId !== payload.caseId ||
      mapping.templateVersionId !== payload.templateVersionId ||
      !extractionIds.has(mapping.extractionId)
    ) throw new Error("SNAPSHOT_MAPPING_SCOPE_MISMATCH");
    if (mapping.status === "unresolved") {
      throw new Error("SNAPSHOT_MAPPING_UNRESOLVED");
    }
    if (mapping.status === "rejected") {
      throw new Error("SNAPSHOT_MAPPING_REJECTED");
    }
    const decision = decisions.get(mapping.reviewDecisionId);
    if (
      !decision || decision.subject.kind !== "form_mapping" ||
      decision.subject.mappingId !== mapping.id ||
      decision.decision !== mapping.status ||
      decision.beforeSha256 !== mapping.beforeSha256 ||
      decision.afterSha256 !== mapping.afterSha256
    ) throw new Error("SNAPSHOT_MAPPING_DECISION_MISMATCH");
    mappedExtractions.add(mapping.extractionId);
    decisionIds.add(mapping.reviewDecisionId);
    mappingIds.add(mapping.id);
    refs.push({
      mappingId: mapping.id,
      mappingVersion: mapping.version,
      mappingSha256: mapping.mappingSha256,
      extractionId: mapping.extractionId,
      reviewDecisionId: mapping.reviewDecisionId,
    });
  }
  if (
    !sameCanonical([...mappedExtractions].sort(), [...payload.extractionIds])
  ) throw new Error("SNAPSHOT_MAPPING_SET_MISMATCH");
  const canonical = canonicalMappingRefs(refs);
  if (!sameCanonical(canonical, payload.mappingRefs)) {
    throw new Error("SNAPSHOT_MAPPING_SET_MISMATCH");
  }
  return { decisionIds, mappingIds };
}

export function buildPackageInputSnapshot(
  value: unknown,
): PackageInputSnapshot {
  const record = requireRecord(value, [
    "payload",
    "currentCaseVersion",
    "template",
    "formInstance",
    "extractions",
    "mappings",
    "fields",
    "decisions",
    "documents",
    "now",
  ], "SNAPSHOT_INPUT_INVALID");
  const input = record as unknown as PackageSnapshotBuildInput;
  const payload = canonicalPayload(input.payload);
  if (
    payload.documentVersionIds.length === 0 ||
    payload.extractionIds.length === 0 ||
    payload.reviewDecisionIds.length === 0 ||
    payload.mappingRefs.length === 0 || payload.fieldEvidenceRefs.length === 0
  ) throw new Error("SNAPSHOT_REFERENCES_REQUIRED");
  requireVersion(input.currentCaseVersion, "SNAPSHOT_CASE_VERSION_INVALID");
  if (input.currentCaseVersion !== payload.caseVersion) {
    throw new Error("SNAPSHOT_CASE_VERSION_MISMATCH");
  }
  const template = requireRecord(input.template, [
    "id",
    "organizationId",
    "status",
  ], "SNAPSHOT_TEMPLATE_INVALID");
  requireUuid(template.id, "SNAPSHOT_TEMPLATE_VERSION_INVALID");
  if (template.organizationId !== payload.organizationId) {
    throw new Error("SNAPSHOT_TEMPLATE_SCOPE_MISMATCH");
  }
  if (template.id !== payload.templateVersionId) {
    throw new Error("SNAPSHOT_TEMPLATE_VERSION_MISMATCH");
  }
  if (template.status !== "published") {
    throw new Error("SNAPSHOT_TEMPLATE_NOT_PUBLISHED");
  }
  const form = requireRecord(input.formInstance, [
    "id",
    "organizationId",
    "caseId",
    "templateVersionId",
    "version",
  ], "SNAPSHOT_FORM_INVALID");
  if (
    form.id !== payload.formInstanceId ||
    form.organizationId !== payload.organizationId ||
    form.caseId !== payload.caseId ||
    form.templateVersionId !== payload.templateVersionId
  ) throw new Error("SNAPSHOT_FORM_SCOPE_MISMATCH");
  if (form.version !== payload.formInstanceVersion) {
    throw new Error("SNAPSHOT_FORM_VERSION_MISMATCH");
  }
  if (
    !Array.isArray(input.extractions) || !Array.isArray(input.mappings) ||
    !Array.isArray(input.fields) || !Array.isArray(input.decisions) ||
    !Array.isArray(input.documents)
  ) throw new Error("SNAPSHOT_INPUT_INVALID");

  const decisions = new Map<string, ReviewDecision>();
  for (const decision of input.decisions) {
    assertReviewDecision(decision);
    if (
      decision.organizationId !== payload.organizationId ||
      (decision.caseId !== null && decision.caseId !== payload.caseId)
    ) throw new Error("REVIEW_SCOPE_MISMATCH");
    if (decisions.has(decision.id)) {
      throw new Error("REVIEW_DECISION_DUPLICATE");
    }
    decisions.set(decision.id, decision);
  }
  const documentDecisionIds = assertDocuments(input, payload);
  assertOperationsReviewComplete({
    organizationId: payload.organizationId,
    caseId: payload.caseId,
    fields: input.fields,
    decisions: input.decisions,
    documents: input.documents,
  });
  assertExtractionsAndFields(input, payload);
  const mapping = assertMappings(input, payload, decisions);
  const fieldIds = new Set(input.fields.map((field) => field.id));
  for (const decision of decisions.values()) {
    const linked = decision.subject.kind === "document_version" ? documentDecisionIds.has(decision.id) : decision.subject.kind === "form_mapping"
      ? mapping.decisionIds.has(decision.id) &&
        mapping.mappingIds.has(decision.subject.mappingId)
      : fieldIds.has(decision.subject.extractionFieldId);
    if (!linked) throw new Error("SNAPSHOT_REVIEW_DECISION_SET_MISMATCH");
  }
  if (
    !sameCanonical(
      canonicalIds([...decisions.keys()], "REVIEW_DECISION"),
      payload.reviewDecisionIds,
    )
  ) throw new Error("SNAPSHOT_REVIEW_DECISION_SET_MISMATCH");
  return Object.freeze({
    ...payload,
    documentVersionIds: Object.freeze([...payload.documentVersionIds]),
    extractionIds: Object.freeze([...payload.extractionIds]),
    reviewDecisionIds: Object.freeze([...payload.reviewDecisionIds]),
    mappingRefs: Object.freeze(
      payload.mappingRefs.map((ref) => Object.freeze({ ...ref })),
    ),
    fieldEvidenceRefs: Object.freeze(
      payload.fieldEvidenceRefs.map((ref) => Object.freeze({ ...ref })),
    ),
    canonicalSha256: hashPackageInputSnapshot(payload),
  });
}
