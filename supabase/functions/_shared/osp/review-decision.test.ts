import assert from "node:assert/strict";

import type { ExtractedField } from "./extraction-contracts.ts";
import { assertOperationsReviewComplete, assertReviewDecision, type ReviewDecision, type ReviewDocumentStatus } from "./review-decision.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const extractionId = "33333333-3333-4333-8333-333333333333";
const documentReviewId = "99999999-9999-4999-8999-999999999999";
const hash = "a".repeat(64);

type ReviewedFieldFixture = ExtractedField & {
  id: string;
  organizationId: string;
  caseId: string;
  extractionId: string;
  beforeSha256: string;
  afterSha256: string;
};

function field(
  fieldKey: string,
  validation: ExtractedField["validation"] = "valid",
  id = "77777777-7777-4777-8777-777777777777",
): ReviewedFieldFixture {
  return {
    id,
    organizationId,
    caseId,
    extractionId,
    beforeSha256: hash,
    afterSha256: "b".repeat(64),
    fieldKey,
    presence: "present",
    value: "synthetic",
    confidence: validation === "low_confidence" ? 0.4 : 0.99,
    evidence: [{
      kind: "xlsx_cell",
      sourceVersionId: "66666666-6666-4666-8666-666666666666",
      sheet: "Input",
      cellRange: "A1",
      rawEvidenceHash: hash,
    }],
    provider: "xlsx_structural",
    modelVersion: "4.4.0",
    schemaVersion: 1,
    validation,
  };
}

function decision(
  extractionFieldId: string,
  outcome: ReviewDecision["decision"] = "accepted",
): ReviewDecision {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    organizationId,
    caseId,
    subject: { kind: "extraction_field", extractionFieldId },
    decision: outcome,
    reviewerSubject: "operations-reviewer",
    reviewerPermission: "osp:operate",
    beforeSha256: hash,
    afterSha256: "b".repeat(64),
    reasonCode: "SOURCE_CONFIRMED",
    createdAt: "2026-08-23T12:00:00.000Z",
  };
}

const eligibleDocument: ReviewDocumentStatus = {
  eligible: true,
  documentVersionId: "55555555-5555-4555-8555-555555555555",
  documentType: "proof_of_address",
  validUntil: "2026-11-23",
  organizationId,
  caseId,
  validFrom: "2026-08-23",
  beforeSha256: hash,
  isLatestCurrent: true,
  afterSha256: hash,
  reviewDecisionId: documentReviewId,
} as ReviewDocumentStatus;

const documentDecision: ReviewDecision = {
  ...decision("55555555-5555-4555-8555-555555555555"),
  id: documentReviewId,
  subject: {
    kind: "document_version",
    documentVersionId: "55555555-5555-4555-8555-555555555555",
  },
  reasonCode: "DOCUMENT_APPROVED",
  beforeSha256: hash,
  afterSha256: hash,
};

function reviewInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    caseId,
    fields: [],
    decisions: [documentDecision],
    documents: [eligibleDocument],
    ...overrides,
  };
}

Deno.test("review decisions validate immutable identity, scope, hashes, authority, and timestamp", () => {
  const fieldId = field("supplier.legalName").id;
  assert.doesNotThrow(() => assertReviewDecision(decision(fieldId)));
  assert.throws(
    () =>
      assertReviewDecision({
        ...decision(fieldId),
        organizationId: "not-a-uuid",
      }),
    /REVIEW_ORGANIZATION_INVALID/,
  );
  assert.throws(
    () =>
      assertReviewDecision({
        ...decision(fieldId),
        beforeSha256: hash.toUpperCase(),
      }),
    /REVIEW_BEFORE_HASH_INVALID/,
  );
  assert.throws(
    () =>
      assertReviewDecision({
        ...decision(fieldId),
        reviewerPermission: "osp:read" as "osp:operate",
      }),
    /REVIEW_PERMISSION_INVALID/,
  );
  assert.throws(
    () => assertReviewDecision({ ...decision(fieldId), createdAt: "tomorrow" }),
    /REVIEW_CREATED_AT_INVALID/,
  );
  assert.throws(
    () =>
      assertReviewDecision({
        ...decision(fieldId),
        reasonCode: "RAW_PRIVATE_VALUE",
      }),
    /REVIEW_REASON_INVALID/,
  );
});

Deno.test("operations review blocks open low-confidence and contradictory extraction fields", () => {
  for (const validation of ["low_confidence", "contradictory"] as const) {
    assert.throws(
      () =>
        assertOperationsReviewComplete(
          reviewInput({ fields: [field("supplier.name", validation)] }),
        ),
      new RegExp(
        validation === "low_confidence" ? "REVIEW_LOW_CONFIDENCE_OPEN" : "REVIEW_CONTRADICTION_OPEN",
      ),
    );
  }
});

Deno.test("operations review blocks fiscal and banking fields until accepted or corrected", () => {
  for (const fieldKey of ["fiscal.taxIdentifier", "banking.accountNumber"]) {
    const reviewedField = field(fieldKey);
    assert.throws(
      () =>
        assertOperationsReviewComplete(
          reviewInput({ fields: [reviewedField] }),
        ),
      /REVIEW_SENSITIVE_FIELD_OPEN/,
    );
    assert.doesNotThrow(() =>
      assertOperationsReviewComplete(
        reviewInput({
          fields: [reviewedField],
          decisions: [
            documentDecision,
            decision(reviewedField.id, "corrected"),
          ],
        }),
      )
    );
  }
});

Deno.test("operations review blocks rejected subjects and ineligible documents with safe codes only", () => {
  assert.throws(
    () => {
      const reviewedField = field("supplier.name");
      assertOperationsReviewComplete(
        reviewInput({
          fields: [reviewedField],
          decisions: [decision(reviewedField.id, "rejected")],
        }),
      );
    },
    /^Error: REVIEW_SUBJECT_REJECTED$/,
  );
  assert.throws(
    () =>
      assertOperationsReviewComplete(
        reviewInput({ documents: [{ eligible: false, reason: "superseded" }] }),
      ),
    /^Error: REVIEW_DOCUMENT_SUPERSEDED$/,
  );
});

Deno.test("accepted or corrected decisions close required review holds", () => {
  const fields = [
    field("supplier.name", "low_confidence"),
    field(
      "fiscal.taxIdentifier",
      "valid",
      "88888888-8888-4888-8888-888888888888",
    ),
  ];
  const decisions = [documentDecision, decision(fields[0].id), {
    ...decision(fields[1].id, "corrected"),
    id: "66666666-6666-4666-8666-666666666666",
  }];
  assert.doesNotThrow(() => assertOperationsReviewComplete(reviewInput({ fields, decisions })));
});

Deno.test("foreign tenant, foreign case, and field-key decisions cannot clear a hold", () => {
  const reviewedField = field("fiscal.taxIdentifier");
  for (
    const attacker of [
      {
        ...decision(reviewedField.fieldKey),
        organizationId: "99999999-9999-4999-8999-999999999999",
      },
      {
        ...decision(reviewedField.fieldKey),
        caseId: "99999999-9999-4999-8999-999999999999",
      },
    ]
  ) {
    assert.throws(
      () =>
        assertOperationsReviewComplete(
          reviewInput({ fields: [reviewedField], decisions: [attacker] }),
        ),
      /REVIEW_(?:SUBJECT_INVALID|SCOPE_MISMATCH)/,
    );
  }
});

Deno.test("review completion binds the exact field UUID and before-after hashes", () => {
  const reviewedField = field("supplier.name", "low_confidence");
  assert.doesNotThrow(() =>
    assertOperationsReviewComplete(
      reviewInput({
        fields: [reviewedField],
        decisions: [documentDecision, decision(reviewedField.id)],
      }),
    )
  );
  assert.throws(
    () =>
      assertOperationsReviewComplete(
        reviewInput({
          fields: [reviewedField],
          decisions: [documentDecision, {
            ...decision(reviewedField.id),
            afterSha256: "c".repeat(64),
          }],
        }),
      ),
    /^Error: REVIEW_DECISION_HASH_MISMATCH$/,
  );
  assert.throws(
    () =>
      assertOperationsReviewComplete(
        reviewInput({
          fields: [reviewedField],
          decisions: [
            documentDecision,
            decision("88888888-8888-4888-8888-888888888888"),
          ],
        }),
      ),
    /^Error: REVIEW_SUBJECT_UNRELATED$/,
  );
});

Deno.test("eligible documents require their exact scoped approval decision and hashes", () => {
  assert.throws(
    () => assertOperationsReviewComplete(reviewInput({ decisions: [] })),
    /^Error: REVIEW_DOCUMENT_UNREVIEWED$/,
  );
  assert.throws(
    () =>
      assertOperationsReviewComplete(
        reviewInput({
          decisions: [{ ...documentDecision, afterSha256: "c".repeat(64) }],
        }),
      ),
    /^Error: REVIEW_DECISION_HASH_MISMATCH$/,
  );
});

Deno.test("ineligible document reasons are a closed safe enum at runtime", () => {
  assert.throws(
    () =>
      assertOperationsReviewComplete(
        reviewInput({
          documents: [
            {
              eligible: false,
              reason: "raw_private_value",
            } as unknown as ReviewDocumentStatus,
          ],
        }),
      ),
    /^Error: REVIEW_DOCUMENT_INVALID$/,
  );
});

Deno.test("organization-level corporate documents require organization-level human review and serve same-org cases", () => {
  const organizationDocument = {
    ...eligibleDocument,
    caseId: null,
  } as unknown as ReviewDocumentStatus;
  const organizationDecision = {
    ...documentDecision,
    caseId: null,
  } as unknown as ReviewDecision;
  assert.doesNotThrow(() =>
    assertOperationsReviewComplete(reviewInput({
      documents: [organizationDocument],
      decisions: [organizationDecision],
    }))
  );
  assert.throws(
    () =>
      assertOperationsReviewComplete(
        reviewInput({
          documents: [organizationDocument],
          decisions: [documentDecision],
        }),
      ),
    /^Error: REVIEW_SCOPE_MISMATCH$/,
  );
});

Deno.test("operations review rejects malformed top-level values with a fixed safe code", () => {
  for (const malformed of [null, [], "review", 7]) {
    assert.throws(
      () => assertOperationsReviewComplete(malformed as never),
      /^Error: REVIEW_INPUT_INVALID$/,
    );
  }
});

Deno.test("document readiness requires an accepted DOCUMENT_APPROVED decision", () => {
  assert.throws(
    () =>
      assertOperationsReviewComplete(reviewInput({
        decisions: [{ ...documentDecision, decision: "corrected" }],
      })),
    /^Error: REVIEW_DOCUMENT_DECISION_INVALID$/,
  );
});

Deno.test("organization-level review is forbidden for supplier requirements", () => {
  const supplierDocument = {
    ...eligibleDocument,
    documentType: "supplier_requirement",
    caseId: null,
    validFrom: null,
    validUntil: null,
    isLatestCurrent: true,
  } as unknown as ReviewDocumentStatus;
  const supplierDecision = {
    ...documentDecision,
    caseId: null,
  } as ReviewDecision;
  assert.throws(
    () => assertOperationsReviewComplete(reviewInput({ documents: [supplierDocument], decisions: [supplierDecision] })),
    /^Error: REVIEW_SCOPE_MISMATCH$/,
  );
});
