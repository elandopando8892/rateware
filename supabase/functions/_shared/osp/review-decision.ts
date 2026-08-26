import { assertExtractedField, type ExtractedField, extractionContractPatterns } from "./extraction-contracts.ts";

export type ReviewSubject =
  | { kind: "extraction_field"; extractionFieldId: string }
  | { kind: "document_version"; documentVersionId: string }
  | { kind: "form_mapping"; mappingId: string };

export type ReviewReasonCode =
  | "SOURCE_CONFIRMED"
  | "VALUE_CORRECTED"
  | "DOCUMENT_APPROVED"
  | "MAPPING_CONFIRMED"
  | "MAPPING_CORRECTED"
  | "REJECTED_INVALID"
  | "REJECTED_UNSUPPORTED";

export type ReviewDecision = {
  id: string;
  organizationId: string;
  caseId: string | null;
  subject: ReviewSubject;
  decision: "accepted" | "corrected" | "rejected";
  reviewerSubject: string;
  reviewerPermission: "osp:operate";
  beforeSha256: string;
  afterSha256: string;
  reasonCode: ReviewReasonCode;
  createdAt: string;
};

export type ReviewDocumentType =
  | "proof_of_address"
  | "sat_compliance_opinion"
  | "tax_status_certificate"
  | "bank_statement"
  | "supplier_requirement";

export type ReviewDocumentStatus =
  | {
    eligible: true;
    documentVersionId: string;
    documentType: ReviewDocumentType;
    organizationId: string;
    caseId: string | null;
    validFrom: string | null;
    validUntil: string | null;
    isLatestCurrent: boolean;
    beforeSha256: string;
    afterSha256: string;
    reviewDecisionId: string;
  }
  | {
    eligible: false;
    reason: "missing" | "unapproved" | "expired" | "superseded" | "invalid";
  };

const SUBJECT_PATTERN = /^[A-Za-z0-9:_@.-]{1,256}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REASON_CODES = new Set<ReviewReasonCode>([
  "SOURCE_CONFIRMED",
  "VALUE_CORRECTED",
  "DOCUMENT_APPROVED",
  "MAPPING_CONFIRMED",
  "MAPPING_CORRECTED",
  "REJECTED_INVALID",
  "REJECTED_UNSUPPORTED",
]);
const DOCUMENT_FINDINGS = Object.freeze({
  missing: "REVIEW_DOCUMENT_MISSING",
  unapproved: "REVIEW_DOCUMENT_UNAPPROVED",
  expired: "REVIEW_DOCUMENT_EXPIRED",
  superseded: "REVIEW_DOCUMENT_SUPERSEDED",
  invalid: "REVIEW_DOCUMENT_INVALID",
});
const DOCUMENT_TYPES = new Set<ReviewDocumentType>([
  "proof_of_address",
  "sat_compliance_opinion",
  "tax_status_certificate",
  "bank_statement",
  "supplier_requirement",
]);

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

function subjectId(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("REVIEW_SUBJECT_INVALID");
  }
  const kind = (value as Record<string, unknown>).kind;
  const key = kind === "extraction_field" ? "extractionFieldId" : kind === "document_version" ? "documentVersionId" : kind === "form_mapping" ? "mappingId" : "";
  if (!key) throw new Error("REVIEW_SUBJECT_INVALID");
  const subject = requireRecord(value, ["kind", key], "REVIEW_SUBJECT_INVALID");
  requireUuid(subject[key], "REVIEW_SUBJECT_INVALID");
  return subject[key] as string;
}

function canonicalTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function assertReviewDecision(
  value: unknown,
): asserts value is ReviewDecision {
  const decision = requireRecord(value, [
    "id",
    "organizationId",
    "caseId",
    "subject",
    "decision",
    "reviewerSubject",
    "reviewerPermission",
    "beforeSha256",
    "afterSha256",
    "reasonCode",
    "createdAt",
  ], "REVIEW_OBJECT_INVALID");
  requireUuid(decision.id, "REVIEW_ID_INVALID");
  requireUuid(decision.organizationId, "REVIEW_ORGANIZATION_INVALID");
  subjectId(decision.subject);
  if (decision.caseId === null) {
    if ((decision.subject as ReviewSubject).kind !== "document_version") {
      throw new Error("REVIEW_CASE_INVALID");
    }
  } else {
    requireUuid(decision.caseId, "REVIEW_CASE_INVALID");
  }
  if (
    !["accepted", "corrected", "rejected"].includes(decision.decision as string)
  ) throw new Error("REVIEW_DECISION_INVALID");
  if (
    typeof decision.reviewerSubject !== "string" ||
    !SUBJECT_PATTERN.test(decision.reviewerSubject)
  ) throw new Error("REVIEWER_SUBJECT_INVALID");
  if (decision.reviewerPermission !== "osp:operate") {
    throw new Error("REVIEW_PERMISSION_INVALID");
  }
  requireSha(decision.beforeSha256, "REVIEW_BEFORE_HASH_INVALID");
  requireSha(decision.afterSha256, "REVIEW_AFTER_HASH_INVALID");
  if (
    typeof decision.reasonCode !== "string" ||
    !REASON_CODES.has(decision.reasonCode as ReviewReasonCode)
  ) throw new Error("REVIEW_REASON_INVALID");
  if (!canonicalTimestamp(decision.createdAt)) {
    throw new Error("REVIEW_CREATED_AT_INVALID");
  }
}

export function assertReviewDocumentStatus(
  value: unknown,
): asserts value is ReviewDocumentStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("REVIEW_DOCUMENT_INVALID");
  }
  if ((value as Record<string, unknown>).eligible === false) {
    const document = requireRecord(
      value,
      ["eligible", "reason"],
      "REVIEW_DOCUMENT_INVALID",
    );
    if (
      typeof document.reason !== "string" ||
      !(document.reason in DOCUMENT_FINDINGS)
    ) throw new Error("REVIEW_DOCUMENT_INVALID");
    return;
  }
  const document = requireRecord(value, [
    "eligible",
    "documentVersionId",
    "documentType",
    "organizationId",
    "caseId",
    "validFrom",
    "validUntil",
    "isLatestCurrent",
    "beforeSha256",
    "afterSha256",
    "reviewDecisionId",
  ], "REVIEW_DOCUMENT_INVALID");
  if (document.eligible !== true) throw new Error("REVIEW_DOCUMENT_INVALID");
  requireUuid(document.documentVersionId, "REVIEW_DOCUMENT_INVALID");
  requireUuid(document.organizationId, "REVIEW_DOCUMENT_INVALID");
  if (document.caseId !== null) {
    requireUuid(document.caseId, "REVIEW_DOCUMENT_INVALID");
  }
  if (
    typeof document.documentType !== "string" ||
    !DOCUMENT_TYPES.has(document.documentType as ReviewDocumentType)
  ) {
    throw new Error("REVIEW_DOCUMENT_INVALID");
  }
  requireUuid(document.reviewDecisionId, "REVIEW_DOCUMENT_INVALID");
  requireSha(document.beforeSha256, "REVIEW_DOCUMENT_INVALID");
  requireSha(document.afterSha256, "REVIEW_DOCUMENT_INVALID");
  if (typeof document.isLatestCurrent !== "boolean") {
    throw new Error("REVIEW_DOCUMENT_INVALID");
  }
  if (document.documentType === "supplier_requirement") {
    if (document.validFrom !== null || document.validUntil !== null) {
      throw new Error("REVIEW_DOCUMENT_INVALID");
    }
    return;
  }
  if (
    typeof document.validFrom !== "string" ||
    !DATE_PATTERN.test(document.validFrom) ||
    typeof document.validUntil !== "string" || !DATE_PATTERN.test(document.validUntil)
  ) throw new Error("REVIEW_DOCUMENT_INVALID");
  for (const value of [document.validFrom, document.validUntil]) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error("REVIEW_DOCUMENT_INVALID");
    }
  }
}

export function assertOperationsReviewComplete(value: unknown): void {
  const input = requireRecord(value, [
    "organizationId",
    "caseId",
    "fields",
    "decisions",
    "documents",
  ], "REVIEW_INPUT_INVALID");
  requireUuid(input.organizationId, "REVIEW_ORGANIZATION_INVALID");
  requireUuid(input.caseId, "REVIEW_CASE_INVALID");
  if (
    !Array.isArray(input.fields) || !Array.isArray(input.decisions) ||
    !Array.isArray(input.documents)
  ) throw new Error("REVIEW_INPUT_INVALID");

  const inputFields = input.fields as readonly unknown[];
  const inputDecisions = input.decisions as readonly unknown[];
  const inputDocuments = input.documents as readonly unknown[];
  const fields = new Map<string, ExtractedField>();
  for (const field of inputFields) {
    assertExtractedField(field);
    if (
      field.organizationId !== input.organizationId ||
      field.caseId !== input.caseId
    ) throw new Error("REVIEW_SCOPE_MISMATCH");
    if (fields.has(field.id)) throw new Error("REVIEW_SUBJECT_DUPLICATE");
    fields.set(field.id, field);
  }
  const documents = new Map<
    string,
    Extract<ReviewDocumentStatus, { eligible: true }>
  >();
  for (const document of inputDocuments) {
    assertReviewDocumentStatus(document);
    if (!document.eligible) throw new Error(DOCUMENT_FINDINGS[document.reason]);
    if (
      document.organizationId !== input.organizationId ||
      (document.documentType === "supplier_requirement" ? document.caseId !== input.caseId : document.caseId !== null && document.caseId !== input.caseId)
    ) {
      throw new Error("REVIEW_SCOPE_MISMATCH");
    }
    if (documents.has(document.documentVersionId)) {
      throw new Error("REVIEW_SUBJECT_DUPLICATE");
    }
    documents.set(document.documentVersionId, document);
  }

  const resolvedFields = new Set<string>();
  const resolvedDocuments = new Set<string>();
  const decisionIds = new Set<string>();
  for (const decision of inputDecisions) {
    assertReviewDecision(decision);
    if (decisionIds.has(decision.id)) {
      throw new Error("REVIEW_DECISION_DUPLICATE");
    }
    decisionIds.add(decision.id);
    if (decision.organizationId !== input.organizationId) {
      throw new Error("REVIEW_SCOPE_MISMATCH");
    }
    if (decision.decision === "rejected") {
      throw new Error("REVIEW_SUBJECT_REJECTED");
    }
    if (decision.subject.kind === "extraction_field") {
      if (decision.caseId !== input.caseId) {
        throw new Error("REVIEW_SCOPE_MISMATCH");
      }
      const field = fields.get(decision.subject.extractionFieldId);
      if (!field) throw new Error("REVIEW_SUBJECT_UNRELATED");
      if (
        decision.beforeSha256 !== field.beforeSha256 ||
        decision.afterSha256 !== field.afterSha256
      ) throw new Error("REVIEW_DECISION_HASH_MISMATCH");
      resolvedFields.add(field.id);
    } else if (decision.subject.kind === "document_version") {
      const document = documents.get(decision.subject.documentVersionId);
      if (!document || document.reviewDecisionId !== decision.id) {
        throw new Error("REVIEW_SUBJECT_UNRELATED");
      }
      if (decision.caseId !== document.caseId) {
        throw new Error("REVIEW_SCOPE_MISMATCH");
      }
      if (
        decision.decision !== "accepted" ||
        decision.reasonCode !== "DOCUMENT_APPROVED"
      ) throw new Error("REVIEW_DOCUMENT_DECISION_INVALID");
      if (
        decision.beforeSha256 !== document.beforeSha256 ||
        decision.afterSha256 !== document.afterSha256
      ) throw new Error("REVIEW_DECISION_HASH_MISMATCH");
      resolvedDocuments.add(document.documentVersionId);
    } else if (decision.caseId !== input.caseId) {
      throw new Error("REVIEW_SCOPE_MISMATCH");
    }
  }

  for (const field of fields.values()) {
    if (field.validation === "invalid") throw new Error("REVIEW_FIELD_INVALID");
    if (
      field.validation === "low_confidence" && !resolvedFields.has(field.id)
    ) throw new Error("REVIEW_LOW_CONFIDENCE_OPEN");
    if (field.validation === "contradictory" && !resolvedFields.has(field.id)) {
      throw new Error("REVIEW_CONTRADICTION_OPEN");
    }
    if (
      /^(?:fiscal|banking)[.]/.test(field.fieldKey) &&
      !resolvedFields.has(field.id)
    ) throw new Error("REVIEW_SENSITIVE_FIELD_OPEN");
  }
  for (const document of documents.values()) {
    if (!resolvedDocuments.has(document.documentVersionId)) {
      throw new Error("REVIEW_DOCUMENT_UNREVIEWED");
    }
  }
}
