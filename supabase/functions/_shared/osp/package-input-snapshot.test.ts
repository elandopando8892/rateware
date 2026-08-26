import assert from "node:assert/strict";

import { buildPackageInputSnapshot, canonicalPackageInputSnapshotText, hashPackageInputSnapshot, type PackageInputSnapshotPayload } from "./package-input-snapshot.ts";
import type { ReviewDecision } from "./review-decision.ts";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  case: "22222222-2222-4222-8222-222222222222",
  documentA: "33333333-3333-4333-8333-333333333333",
  documentB: "44444444-4444-4444-8444-444444444444",
  documentC: "14141414-1414-4414-8414-141414141414",
  documentD: "15151515-1515-4515-8515-151515151515",
  supplierDocument: "16161616-1616-4616-8616-161616161616",
  extractionA: "55555555-5555-4555-8555-555555555555",
  extractionB: "66666666-6666-4666-8666-666666666666",
  template: "77777777-7777-4777-8777-777777777777",
  form: "88888888-8888-4888-8888-888888888888",
  reviewA: "99999999-9999-4999-8999-999999999999",
  reviewB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reviewC: "12121212-1212-4212-8212-121212121212",
  reviewD: "13131313-1313-4313-8313-131313131313",
  reviewE: "17171717-1717-4717-8717-171717171717",
  reviewF: "18181818-1818-4818-8818-181818181818",
  reviewSupplier: "19191919-1919-4919-8919-191919191919",
  reviewExtra: "20202020-2020-4020-8020-202020202020",
  fieldA: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  fieldB: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  mappingA: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  mappingB: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

type ReviewedPayload = PackageInputSnapshotPayload & {
  mappingRefs: readonly {
    mappingId: string;
    mappingVersion: number;
    mappingSha256: string;
    extractionId: string;
    reviewDecisionId: string;
  }[];
  fieldEvidenceRefs: readonly {
    fieldId: string;
    extractionId: string;
    kind: "pdf_region" | "xlsx_cell";
    sourceVersionId: string;
    rawEvidenceHash: string;
  }[];
};

const payload: ReviewedPayload = {
  organizationId: ids.organization,
  caseId: ids.case,
  caseVersion: 7,
  documentVersionIds: [
    ids.documentA,
    ids.documentB,
    ids.documentC,
    ids.documentD,
  ],
  extractionIds: [ids.extractionA, ids.extractionB],
  templateVersionId: ids.template,
  formInstanceId: ids.form,
  formInstanceVersion: 3,
  reviewDecisionIds: [
    ids.reviewA,
    ids.reviewB,
    ids.reviewC,
    ids.reviewD,
    ids.reviewE,
    ids.reviewF,
  ],
  mappingRefs: [
    {
      mappingId: ids.mappingA,
      mappingVersion: 1,
      mappingSha256: "b".repeat(64),
      extractionId: ids.extractionA,
      reviewDecisionId: ids.reviewA,
    },
    {
      mappingId: ids.mappingB,
      mappingVersion: 2,
      mappingSha256: "b".repeat(64),
      extractionId: ids.extractionB,
      reviewDecisionId: ids.reviewB,
    },
  ],
  fieldEvidenceRefs: [
    {
      fieldId: ids.fieldA,
      extractionId: ids.extractionA,
      kind: "xlsx_cell",
      sourceVersionId: ids.documentA,
      rawEvidenceHash: "a".repeat(64),
    },
    {
      fieldId: ids.fieldB,
      extractionId: ids.extractionB,
      kind: "pdf_region",
      sourceVersionId: ids.documentB,
      rawEvidenceHash: "a".repeat(64),
    },
  ],
};

Deno.test("package snapshot hash is invariant to caller array ordering without mutating input", () => {
  const reversed: ReviewedPayload = {
    ...payload,
    documentVersionIds: [...payload.documentVersionIds].reverse(),
    extractionIds: [...payload.extractionIds].reverse(),
    reviewDecisionIds: [...payload.reviewDecisionIds].reverse(),
    mappingRefs: [...payload.mappingRefs].reverse(),
    fieldEvidenceRefs: [...payload.fieldEvidenceRefs].reverse(),
  };
  const before = JSON.stringify(reversed);
  assert.equal(
    hashPackageInputSnapshot(payload),
    hashPackageInputSnapshot(reversed),
  );
  assert.equal(JSON.stringify(reversed), before);
});

Deno.test("canonical v2 text and SHA-256 use the exact cross-runtime test vector", () => {
  const expected = [
    "osp-package-input-snapshot-v2",
    `organizationId=${ids.organization}`,
    `caseId=${ids.case}`,
    "caseVersion=7",
    `documentVersionId=${ids.documentC}`,
    `documentVersionId=${ids.documentD}`,
    `documentVersionId=${ids.documentA}`,
    `documentVersionId=${ids.documentB}`,
    `extractionId=${ids.extractionA}`,
    `extractionId=${ids.extractionB}`,
    `templateVersionId=${ids.template}`,
    `formInstanceId=${ids.form}`,
    "formInstanceVersion=3",
    `reviewDecisionId=${ids.reviewC}`,
    `reviewDecisionId=${ids.reviewD}`,
    `reviewDecisionId=${ids.reviewE}`,
    `reviewDecisionId=${ids.reviewF}`,
    `reviewDecisionId=${ids.reviewA}`,
    `reviewDecisionId=${ids.reviewB}`,
    `mappingRef=${ids.mappingA}|1|${"b".repeat(64)}|${ids.extractionA}|${ids.reviewA}`,
    `mappingRef=${ids.mappingB}|2|${"b".repeat(64)}|${ids.extractionB}|${ids.reviewB}`,
    `fieldEvidenceRef=${ids.fieldA}|${ids.extractionA}|xlsx_cell|${ids.documentA}|${"a".repeat(64)}`,
    `fieldEvidenceRef=${ids.fieldB}|${ids.extractionB}|pdf_region|${ids.documentB}|${"a".repeat(64)}`,
  ].join("\n");
  assert.equal(canonicalPackageInputSnapshotText(payload), expected);
  assert.equal(
    hashPackageInputSnapshot(payload),
    "4a71993745a730eaeb337630cc40dd46c32f08bff57bf228ad968ef89c7db3c2",
  );
});

Deno.test("package snapshot hash changes for every aggregate and immutable-version input", () => {
  const baseline = hashPackageInputSnapshot(payload);
  const changes: ReviewedPayload[] = [
    { ...payload, caseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { ...payload, caseVersion: 8 },
    {
      ...payload,
      documentVersionIds: [
        ids.documentA,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
    },
    {
      ...payload,
      extractionIds: [ids.extractionA, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    },
    { ...payload, templateVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { ...payload, formInstanceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { ...payload, formInstanceVersion: 4 },
    {
      ...payload,
      reviewDecisionIds: [ids.reviewA, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    },
    {
      ...payload,
      mappingRefs: [
        { ...payload.mappingRefs[0], mappingVersion: 2 },
        payload.mappingRefs[1],
      ],
    },
    {
      ...payload,
      mappingRefs: [{
        ...payload.mappingRefs[0],
        mappingSha256: "c".repeat(64),
      }, payload.mappingRefs[1]],
    },
    {
      ...payload,
      fieldEvidenceRefs: [{
        ...payload.fieldEvidenceRefs[0],
        sourceVersionId: ids.documentB,
      }, payload.fieldEvidenceRefs[1]],
    },
    {
      ...payload,
      fieldEvidenceRefs: [{
        ...payload.fieldEvidenceRefs[0],
        rawEvidenceHash: "c".repeat(64),
      }, payload.fieldEvidenceRefs[1]],
    },
  ];
  for (const changed of changes) {
    assert.notEqual(hashPackageInputSnapshot(changed), baseline);
  }
});

Deno.test("package snapshot hashing rejects malformed UUIDs, versions, and duplicate inputs", () => {
  assert.throws(
    () => hashPackageInputSnapshot({ ...payload, organizationId: "org-1" }),
    /SNAPSHOT_ORGANIZATION_INVALID/,
  );
  assert.throws(
    () => hashPackageInputSnapshot({ ...payload, caseVersion: -1 }),
    /SNAPSHOT_CASE_VERSION_INVALID/,
  );
  assert.throws(
    () =>
      hashPackageInputSnapshot({
        ...payload,
        documentVersionIds: [ids.documentA, ids.documentA],
      }),
    /SNAPSHOT_DOCUMENT_IDS_DUPLICATE/,
  );
});

function buildInput() {
  const beforeSha256 = "a".repeat(64);
  const afterSha256 = "b".repeat(64);
  const fields = [
    {
      id: ids.fieldA,
      organizationId: ids.organization,
      caseId: ids.case,
      extractionId: ids.extractionA,
      beforeSha256,
      afterSha256,
      fieldKey: "supplier.legalName",
      presence: "present" as const,
      value: "Synthetic Supplier",
      confidence: 0.99,
      evidence: [{
        kind: "xlsx_cell" as const,
        sourceVersionId: ids.documentA,
        sheet: "Input",
        cellRange: "A1",
        rawEvidenceHash: beforeSha256,
      }],
      provider: "xlsx_structural" as const,
      modelVersion: "4.4.0",
      schemaVersion: 1 as const,
      validation: "valid" as const,
    },
    {
      id: ids.fieldB,
      organizationId: ids.organization,
      caseId: ids.case,
      extractionId: ids.extractionB,
      beforeSha256,
      afterSha256,
      fieldKey: "supplier.address",
      presence: "present" as const,
      value: "Synthetic Address",
      confidence: 0.99,
      evidence: [{
        kind: "pdf_region" as const,
        sourceVersionId: ids.documentB,
        page: 1,
        polygon: [0, 0, 1, 0, 1, 1, 0, 1],
        rawEvidenceHash: beforeSha256,
      }],
      provider: "azure_document_intelligence" as const,
      modelVersion: "2024-11-30",
      schemaVersion: 1 as const,
      validation: "valid" as const,
    },
  ];
  const mappings = [
    {
      id: ids.mappingA,
      organizationId: ids.organization,
      caseId: ids.case,
      templateVersionId: ids.template,
      extractionId: ids.extractionA,
      reviewDecisionId: ids.reviewA,
      status: "accepted" as const,
      version: 1,
      mappingSha256: afterSha256,
      beforeSha256,
      afterSha256,
    },
    {
      id: ids.mappingB,
      organizationId: ids.organization,
      caseId: ids.case,
      templateVersionId: ids.template,
      extractionId: ids.extractionB,
      reviewDecisionId: ids.reviewB,
      status: "corrected" as const,
      version: 2,
      mappingSha256: afterSha256,
      beforeSha256,
      afterSha256,
    },
  ];
  const mappingDecisions: ReviewDecision[] = mappings.map((mapping, index) => ({
    id: mapping.reviewDecisionId,
    organizationId: ids.organization,
    caseId: ids.case,
    subject: { kind: "form_mapping" as const, mappingId: mapping.id },
    decision: mapping.status,
    reviewerSubject: "operations-reviewer",
    reviewerPermission: "osp:operate" as const,
    beforeSha256,
    afterSha256,
    reasonCode: index === 0 ? "MAPPING_CONFIRMED" : "MAPPING_CORRECTED",
    createdAt: "2026-08-23T12:00:00.000Z",
  }));
  const documentDecisions: ReviewDecision[] = [
    { id: ids.reviewC, documentVersionId: ids.documentA },
    { id: ids.reviewD, documentVersionId: ids.documentB },
    { id: ids.reviewE, documentVersionId: ids.documentC },
    { id: ids.reviewF, documentVersionId: ids.documentD },
  ].map((document) => ({
    id: document.id,
    organizationId: ids.organization,
    caseId: ids.case,
    subject: {
      kind: "document_version" as const,
      documentVersionId: document.documentVersionId,
    },
    decision: "accepted" as const,
    reviewerSubject: "operations-reviewer",
    reviewerPermission: "osp:operate" as const,
    beforeSha256,
    afterSha256,
    reasonCode: "DOCUMENT_APPROVED",
    createdAt: "2026-08-23T12:00:00.000Z",
  }));
  return {
    payload,
    currentCaseVersion: 7,
    template: {
      id: ids.template,
      organizationId: ids.organization,
      status: "published" as const,
    },
    formInstance: {
      id: ids.form,
      organizationId: ids.organization,
      caseId: ids.case,
      templateVersionId: ids.template,
      version: 3,
    },
    extractions: [
      {
        id: ids.extractionA,
        organizationId: ids.organization,
        caseId: ids.case,
        sourceVersionId: ids.documentA,
        status: "reviewed" as const,
        fieldIds: [ids.fieldA],
      },
      {
        id: ids.extractionB,
        organizationId: ids.organization,
        caseId: ids.case,
        sourceVersionId: ids.documentB,
        status: "reviewed" as const,
        fieldIds: [ids.fieldB],
      },
    ],
    mappings,
    fields,
    decisions: [...mappingDecisions, ...documentDecisions],
    documents: [
      {
        eligible: true as const,
        documentVersionId: ids.documentA,
        documentType: "proof_of_address" as const,
        organizationId: ids.organization,
        caseId: ids.case,
        validFrom: "2026-08-23",
        validUntil: "2026-11-23",
        isLatestCurrent: true,
        beforeSha256,
        afterSha256,
        reviewDecisionId: ids.reviewC,
      },
      {
        eligible: true as const,
        documentVersionId: ids.documentB,
        documentType: "sat_compliance_opinion" as const,
        organizationId: ids.organization,
        caseId: ids.case,
        validFrom: "2026-08-23",
        validUntil: "2026-11-23",
        isLatestCurrent: true,
        beforeSha256,
        afterSha256,
        reviewDecisionId: ids.reviewD,
      },
      {
        eligible: true as const,
        documentVersionId: ids.documentC,
        documentType: "tax_status_certificate" as const,
        organizationId: ids.organization,
        caseId: ids.case,
        validFrom: "2026-08-23",
        validUntil: "2026-11-23",
        isLatestCurrent: true,
        beforeSha256,
        afterSha256,
        reviewDecisionId: ids.reviewE,
      },
      {
        eligible: true as const,
        documentVersionId: ids.documentD,
        documentType: "bank_statement" as const,
        organizationId: ids.organization,
        caseId: ids.case,
        validFrom: "2026-08-23",
        validUntil: "2026-11-23",
        isLatestCurrent: true,
        beforeSha256,
        afterSha256,
        reviewDecisionId: ids.reviewF,
      },
    ],
    now: new Date("2026-08-23T12:00:00.000Z"),
  };
}

function build(candidate: unknown) {
  return buildPackageInputSnapshot(
    candidate as Parameters<typeof buildPackageInputSnapshot>[0],
  );
}

Deno.test("buildPackageInputSnapshot returns only immutable input references and canonical hash", () => {
  const snapshot = buildPackageInputSnapshot(buildInput());
  assert.deepEqual(snapshot, {
    ...payload,
    documentVersionIds: [...payload.documentVersionIds].sort(),
    extractionIds: [...payload.extractionIds].sort(),
    reviewDecisionIds: [...payload.reviewDecisionIds].sort(),
    canonicalSha256: hashPackageInputSnapshot(payload),
  });
  for (
    const forbidden of [
      "pdf",
      "mime",
      "signatureReference",
      "authorization",
      "recipient",
      "outboundPackage",
    ]
  ) {
    assert.equal(forbidden in snapshot, false);
  }
});

Deno.test("buildPackageInputSnapshot rejects stale cases, drafts, unresolved mappings, and invalid documents", () => {
  assert.throws(
    () => build({ ...buildInput(), currentCaseVersion: 8 }),
    /SNAPSHOT_CASE_VERSION_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...buildInput(),
        template: {
          id: ids.template,
          organizationId: ids.organization,
          status: "draft",
        },
      }),
    /SNAPSHOT_TEMPLATE_NOT_PUBLISHED/,
  );
  assert.throws(
    () =>
      build({
        ...buildInput(),
        mappings: [{ ...buildInput().mappings[0], status: "unresolved" }],
      }),
    /SNAPSHOT_MAPPING_UNRESOLVED/,
  );
  assert.throws(
    () =>
      build({
        ...buildInput(),
        documents: [{ eligible: false, reason: "unapproved" }],
      }),
    /REVIEW_DOCUMENT_UNAPPROVED/,
  );
  assert.throws(
    () =>
      build({
        ...buildInput(),
        documents: [{ eligible: false, reason: "expired" }],
      }),
    /REVIEW_DOCUMENT_EXPIRED/,
  );
});

Deno.test("buildPackageInputSnapshot rejects a document at the validity boundary", () => {
  const input = buildInput();
  assert.throws(
    () =>
      build({
        ...input,
        documents: [
          { ...input.documents[0], validUntil: "2026-08-23" },
          input.documents[1],
        ],
      }),
    /REVIEW_DOCUMENT_EXPIRED/,
  );
});

Deno.test("package snapshots reject empty and nonexistent reference sets", () => {
  const empty = {
    ...buildInput(),
    payload: {
      ...payload,
      documentVersionIds: [],
      extractionIds: [],
      reviewDecisionIds: [],
    },
    documents: [],
    extractions: [],
    fields: [],
    mappings: [],
    decisions: [],
  };
  assert.throws(() => build(empty), /SNAPSHOT_REFERENCES_REQUIRED/);
  const missingExtraction = {
    ...buildInput(),
    extractions: buildInput().extractions.slice(0, 1),
  };
  assert.throws(
    () => build(missingExtraction),
    /SNAPSHOT_EXTRACTION_SET_MISMATCH/,
  );
});

Deno.test("package snapshots bind every document, extraction, and field to the expected tenant and case", () => {
  const foreign = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const input = buildInput();
  assert.throws(
    () =>
      build({
        ...input,
        documents: [
          { ...input.documents[0], organizationId: foreign },
          input.documents[1],
        ],
      }),
    /SNAPSHOT_DOCUMENT_SCOPE_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...input,
        extractions: [
          { ...input.extractions[0], caseId: foreign },
          input.extractions[1],
        ],
      }),
    /SNAPSHOT_EXTRACTION_SCOPE_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...input,
        fields: [{
          ...input.fields[0],
          extractionId: ids.extractionB,
          evidence: [{
            ...input.fields[0].evidence[0],
            sourceVersionId: ids.documentB,
          }],
        }, input.fields[1]],
      }),
    /SNAPSHOT_EXTRACTION_FIELD_MISMATCH/,
  );
});

Deno.test("package snapshots require exact mapping decisions and scoped decision IDs", () => {
  const input = buildInput();
  assert.throws(
    () =>
      build({
        ...input,
        decisions: [{
          ...input.decisions[0],
          subject: {
            kind: "extraction_field" as const,
            extractionFieldId: ids.fieldA,
          },
        }, ...input.decisions.slice(1)],
      }),
    /SNAPSHOT_MAPPING_DECISION_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...input,
        decisions: [
          { ...input.decisions[0], caseId: ids.documentA },
          ...input.decisions.slice(1),
        ],
      }),
    /REVIEW_SCOPE_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...input,
        mappings: [{
          ...input.mappings[0],
          mappingSha256: "c".repeat(64),
          afterSha256: "c".repeat(64),
        }, input.mappings[1]],
      }),
    /SNAPSHOT_MAPPING_DECISION_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...input,
        payload: {
          ...input.payload,
          mappingRefs: input.payload.mappingRefs.slice(0, 1),
        },
      }),
    /^Error: SNAPSHOT_MAPPING_SET_MISMATCH$/,
  );
  const extraDecision: ReviewDecision = {
    ...input.decisions[0],
    id: ids.reviewExtra,
    subject: {
      kind: "form_mapping",
      mappingId: "21212121-2121-4121-8121-212121212121",
    },
  };
  assert.throws(
    () =>
      build({
        ...input,
        payload: {
          ...input.payload,
          reviewDecisionIds: [
            ...input.payload.reviewDecisionIds,
            ids.reviewExtra,
          ],
        },
        decisions: [...input.decisions, extraDecision],
      }),
    /^Error: SNAPSHOT_REVIEW_DECISION_SET_MISMATCH$/,
  );
});

Deno.test("package snapshots bind form instance, template, mapping, and versions to one scope", () => {
  const input = buildInput();
  assert.throws(
    () =>
      build({
        ...input,
        formInstance: { ...input.formInstance, caseId: ids.documentA },
      }),
    /SNAPSHOT_FORM_SCOPE_MISMATCH/,
  );
  assert.throws(
    () => build({ ...input, formInstance: { ...input.formInstance, version: 4 } }),
    /SNAPSHOT_FORM_VERSION_MISMATCH/,
  );
  assert.throws(
    () =>
      build({
        ...input,
        mappings: [
          { ...input.mappings[0], templateVersionId: ids.documentA },
          input.mappings[1],
        ],
      }),
    /SNAPSHOT_MAPPING_SCOPE_MISMATCH/,
  );
});

Deno.test("package snapshots reject cross-source evidence and bind evidence identity into the hash", () => {
  const input = buildInput();
  const crossedFields = [
    {
      ...input.fields[0],
      evidence: [{
        ...input.fields[0].evidence[0],
        sourceVersionId: ids.documentB,
      }],
    },
    input.fields[1],
  ];
  assert.throws(
    () => build({ ...input, fields: crossedFields }),
    /^Error: SNAPSHOT_EVIDENCE_SOURCE_MISMATCH$/,
  );
  const changedPayload = {
    ...input.payload,
    fieldEvidenceRefs: [{
      ...input.payload.fieldEvidenceRefs[0],
      sourceVersionId: ids.documentB,
    }, input.payload.fieldEvidenceRefs[1]],
  };
  assert.notEqual(
    hashPackageInputSnapshot(changedPayload),
    hashPackageInputSnapshot(input.payload),
  );
});

Deno.test("quarterly gate requires each exact type and supplier evidence never substitutes", () => {
  const input = buildInput();
  assert.throws(
    () =>
      build({
        ...input,
        payload: {
          ...input.payload,
          documentVersionIds: input.payload.documentVersionIds.filter((id) => id !== ids.documentC),
          reviewDecisionIds: input.payload.reviewDecisionIds.filter((id) => id !== ids.reviewE),
        },
        documents: input.documents.filter((document) => document.documentVersionId !== ids.documentC),
        decisions: input.decisions.filter((decision) => decision.id !== ids.reviewE),
      }),
    /^Error: SNAPSHOT_QUARTERLY_DOCUMENT_REQUIRED$/,
  );
  const supplierDecision: ReviewDecision = {
    ...input.decisions.find((decision) => decision.id === ids.reviewE)!,
    id: ids.reviewSupplier,
    subject: {
      kind: "document_version",
      documentVersionId: ids.supplierDocument,
    },
  };
  assert.throws(
    () =>
      build({
        ...input,
        payload: {
          ...input.payload,
          documentVersionIds: input.payload.documentVersionIds.map((id) => id === ids.documentC ? ids.supplierDocument : id),
          reviewDecisionIds: input.payload.reviewDecisionIds.map((id) => id === ids.reviewE ? ids.reviewSupplier : id),
        },
        documents: input.documents.map((document) =>
          document.documentVersionId === ids.documentC
            ? {
              ...document,
              documentVersionId: ids.supplierDocument,
              documentType: "supplier_requirement" as const,
              validFrom: null,
              validUntil: null,
              isLatestCurrent: true,
              reviewDecisionId: ids.reviewSupplier,
            }
            : document
        ),
        decisions: input.decisions.map((decision) => decision.id === ids.reviewE ? supplierDecision : decision),
      }),
    /^Error: SNAPSHOT_QUARTERLY_DOCUMENT_REQUIRED$/,
  );
});

Deno.test("organization-level corporate documents serve a same-organization case with organization-level review", () => {
  const input = buildInput();
  assert.doesNotThrow(() =>
    build({
      ...input,
      documents: input.documents.map((document) => document.documentVersionId === ids.documentC ? { ...document, caseId: null } : document),
      decisions: input.decisions.map((decision) => decision.id === ids.reviewE ? { ...decision, caseId: null } : decision),
    })
  );
});

Deno.test("snapshot runtime boundaries reject malformed top-level values and clocks with safe codes", () => {
  for (const malformed of [null, [], "payload", 7]) {
    assert.throws(() => build(malformed), /^Error: SNAPSHOT_INPUT_INVALID$/);
  }
  assert.throws(
    () => build({ ...buildInput(), now: null }),
    /^Error: SNAPSHOT_CLOCK_INVALID$/,
  );
  assert.throws(
    () => hashPackageInputSnapshot(null as unknown as PackageInputSnapshotPayload),
    /^Error: SNAPSHOT_PAYLOAD_INVALID$/,
  );
});

Deno.test("package snapshots require every extraction to be reviewed", () => {
  const input = buildInput();
  assert.throws(
    () =>
      build({
        ...input,
        extractions: input.extractions.map((extraction, index) => ({
          ...extraction,
          status: index === 0 ? "failed" : "reviewed",
        })),
      }),
    /^Error: SNAPSHOT_EXTRACTION_NOT_REVIEWED$/,
  );
});

Deno.test("supplier requirements are case-scoped and cannot use the organization vault exception", () => {
  const input = buildInput();
  const supplierDecision: ReviewDecision = {
    ...input.decisions.find((decision) => decision.id === ids.reviewE)!,
    id: ids.reviewSupplier,
    caseId: null,
    subject: {
      kind: "document_version",
      documentVersionId: ids.supplierDocument,
    },
  };
  assert.throws(
    () =>
      build({
        ...input,
        payload: {
          ...input.payload,
          documentVersionIds: [...input.payload.documentVersionIds, ids.supplierDocument],
          reviewDecisionIds: [...input.payload.reviewDecisionIds, ids.reviewSupplier],
        },
        documents: [...input.documents, {
          eligible: true,
          documentVersionId: ids.supplierDocument,
          documentType: "supplier_requirement",
          organizationId: ids.organization,
          caseId: null,
          validFrom: null,
          validUntil: null,
          isLatestCurrent: true,
          beforeSha256: "a".repeat(64),
          afterSha256: "b".repeat(64),
          reviewDecisionId: ids.reviewSupplier,
        }],
        decisions: [...input.decisions, supplierDecision],
      }),
    /^Error: SNAPSHOT_DOCUMENT_SCOPE_MISMATCH$/,
  );
});

Deno.test("quarterly documents must be active on the UTC snapshot date and the latest unique current version", () => {
  const input = buildInput();
  const reviewedExtractions = input.extractions.map((extraction) => ({ ...extraction, status: "reviewed" as const }));
  const activeDocuments = input.documents.map((document) => ({
    ...document,
    validFrom: "2026-08-23",
    isLatestCurrent: true,
  }));
  assert.throws(
    () => build({ ...input, extractions: reviewedExtractions, documents: activeDocuments.map((document, index) => index === 0 ? { ...document, validFrom: "2026-08-24" } : document) }),
    /^Error: REVIEW_DOCUMENT_NOT_CURRENT$/,
  );
  assert.throws(
    () => build({ ...input, extractions: reviewedExtractions, documents: activeDocuments.map((document, index) => index === 0 ? { ...document, isLatestCurrent: false } : document) }),
    /^Error: REVIEW_DOCUMENT_NOT_LATEST$/,
  );
});

Deno.test("snapshot versions are bounded by the PostgreSQL integer domain", () => {
  for (
    const changed of [
      { ...payload, caseVersion: 2147483648 },
      { ...payload, formInstanceVersion: 2147483648 },
      { ...payload, mappingRefs: [{ ...payload.mappingRefs[0], mappingVersion: 2147483648 }, payload.mappingRefs[1]] },
    ]
  ) {
    assert.throws(
      () => hashPackageInputSnapshot(changed),
      /SNAPSHOT_(?:CASE|FORM|MAPPING)_VERSION_INVALID/,
    );
  }
});

Deno.test("nested snapshot inputs fail with fixed codes instead of native errors", () => {
  const input = buildInput();
  assert.throws(
    () => build({ ...input, documents: [null] }),
    /^Error: REVIEW_DOCUMENT_INVALID$/,
  );
  assert.throws(
    () => build({ ...input, extractions: [null] }),
    /^Error: SNAPSHOT_EXTRACTION_INVALID$/,
  );
  assert.throws(
    () => build({ ...input, mappings: [null] }),
    /^Error: SNAPSHOT_MAPPING_INVALID$/,
  );
});
