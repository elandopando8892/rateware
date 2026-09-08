import { deepStrictEqual as assertEquals } from "node:assert/strict";
import {
  buildRequestContract,
  evaluateRequestFulfillment,
  type FulfillmentEvidence,
  type RequestContract,
} from "./request-contract.ts";

const mime = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
};
const sha = "a".repeat(64);
const form = (name: string, format: string) => ({
  name,
  format,
  action: "complete",
  required: true,
  evidenceIds: ["email:mixed"],
});
const manifest = {
  requestType: "customer_setup",
  targetXbfEntity: "XBFUS",
  forms: [
    form("Carrier registration", "xlsm"),
    form("Carrier questionnaire", "docx"),
    form("Carrier references", "xlsx"),
    form("Carrier annex", "xlsm"),
  ],
  requestedDocuments: [{
    documentType: "W-9",
    required: true,
    evidenceIds: ["email:mixed"],
  }],
  requirements: [
    "Return Carrier registration in PDF format, two pages at 100% with wet signature.",
    "Return Carrier questionnaire in DOCX format at 100%.",
    "Return Carrier references in XLSX format at 100%.",
    "Return Carrier annex in XLSM format at 100%.",
    "Provide W-9 in PDF format.",
  ].map((text, index) => ({
    text,
    evidenceIds: [`email:instruction-${index}`],
  })),
};

function completeEvidence(contract: RequestContract): FulfillmentEvidence[] {
  return contract.requirements.map((requirement, index) => ({
    evidenceId: `artifact:mixed-${index}`,
    canonicalKey: requirement.canonicalKey,
    label: requirement.label,
    // Expectations are independent of the generated contract.
    contentType: [mime.pdf, mime.docx, mime.xlsx, mime.xlsm, mime.pdf][index],
    status: "approved",
    validFrom: null,
    expiresAt: null,
    pageCount: index === 0 ? 2 : null,
    completionPercent: index < 4 ? 100 : null,
    signatureMethod: index === 0 ? "wet" : "none",
    includedForOutbound: true,
  }));
}
function assess(contract: RequestContract, evidence: FulfillmentEvidence[]) {
  return evaluateRequestFulfillment({
    contract,
    evidence,
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-07T12:00:00Z"),
  });
}

Deno.test("mixed request isolates format, pages and signature to the named form", () => {
  const contract = buildRequestContract({ manifestSha256: sha, manifest });
  assertEquals(
    contract.requirements.map((item) => ({
      format: item.acceptedContentTypes,
      pages: item.minimumPageCount,
      signature: item.signatureMethod,
    })),
    [
      { format: [mime.pdf], pages: 2, signature: "wet" },
      { format: [mime.docx], pages: null, signature: "none" },
      { format: [mime.xlsx], pages: null, signature: "none" },
      { format: [mime.xlsm], pages: null, signature: "none" },
      { format: [mime.pdf], pages: null, signature: "none" },
    ],
  );
  const result = assess(contract, completeEvidence(contract));
  assertEquals(result.satisfiedRequired, 5);
  assertEquals(result.blockingCount, 0);
  assertEquals(Object.values(result.gates), [
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
});

Deno.test("each missing or incomplete form blocks a mixed package independently", () => {
  const contract = buildRequestContract({ manifestSha256: sha, manifest });
  const evidence = completeEvidence(contract);
  for (let index = 0; index < evidence.length; index++) {
    const missing = assess(contract, evidence.filter((_, i) => i !== index));
    assertEquals(missing.items[index].status, "missing");
    assertEquals(missing.blockingCount, 1);
    assertEquals(missing.gates.send, false);
    if (index < 4) {
      const incomplete = assess(
        contract,
        evidence.map((item, i) =>
          i === index ? { ...item, completionPercent: 99 } : item
        ),
      );
      assertEquals(incomplete.items[index].status, "incomplete");
      assertEquals(incomplete.gates.operationsReview, false);
      assertEquals(incomplete.gates.send, false);
    }
  }
});

Deno.test("wrong format, missing signature, review and payload inclusion remain separate stops", () => {
  const contract = buildRequestContract({ manifestSha256: sha, manifest });
  const evidence = completeEvidence(contract);
  for (let index = 0; index < evidence.length; index++) {
    const wrong = assess(
      contract,
      evidence.map((item, i) =>
        i === index ? { ...item, contentType: "image/png" } : item
      ),
    );
    assertEquals(wrong.items[index].status, "wrong_format");
    assertEquals(wrong.blockingCount, 1);
    assertEquals(wrong.gates.send, false);
  }
  const unsigned = assess(
    contract,
    evidence.map((item, i) =>
      i === 0 ? { ...item, signatureMethod: "none" } : item
    ),
  );
  assertEquals(unsigned.items[0].status, "signature_missing");
  assertEquals(unsigned.gates.operationsReview, true);
  assertEquals(unsigned.gates.send, false);
  const unreviewed = assess(
    contract,
    evidence.map((item, i) =>
      i === 1 ? { ...item, status: "review_required" } : item
    ),
  );
  assertEquals(unreviewed.items[1].status, "review_required");
  assertEquals(unreviewed.gates.operationsReview, false);
  const unattached = assess(
    contract,
    evidence.map((item, i) =>
      i === 2 ? { ...item, includedForOutbound: false } : item
    ),
  );
  assertEquals(unattached.items[2].status, "not_attached");
  assertEquals(unattached.gates.outboundDraft, true);
  assertEquals(unattached.gates.outboundFreeze, false);
  assertEquals(unattached.gates.salesAuthorization, false);
  assertEquals(unattached.gates.send, false);
});

Deno.test("a completed DOCX without a signature requirement can pass Operations", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: {
      ...manifest,
      forms: [form("Questionnaire", "docx")],
      requestedDocuments: [],
      requirements: [],
    },
  });
  const result = assess(contract, [{
    ...completeEvidence(contract)[0],
    contentType: mime.docx,
    signatureMethod: "none",
  }]);
  assertEquals(result.gates.operationsReview, true);
  assertEquals(result.gates.send, true);
});

Deno.test("W-9 PDF instructions do not convert a separately requested DOCX form", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: {
      ...manifest,
      forms: [form("Questionnaire.docx", "docx")],
      requirements: [{
        text: "Provide W-9 in PDF format.",
        evidenceIds: ["email:w9"],
      }],
    },
  });
  assertEquals(contract.requirements[0].acceptedContentTypes, [mime.docx]);
  assertEquals(contract.requirements[1].acceptedContentTypes, [mime.pdf]);
});

Deno.test("official XLSM MIME stays restricted and unknown forms cannot act as a wildcard", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: {
      ...manifest,
      forms: [form("Annex", mime.xlsm)],
      requestedDocuments: [],
      requirements: [],
    },
  });
  assertEquals(contract.requirements[0].acceptedContentTypes, [mime.xlsm]);
  const wrong = assess(contract, completeEvidence(contract));
  assertEquals(wrong.items[0].status, "wrong_format");
  for (const format of ["other", "unknown", "application/zip"]) {
    const unknown = buildRequestContract({
      manifestSha256: sha,
      manifest: {
        ...manifest,
        forms: [form("Unclassified attachment", format)],
        requestedDocuments: [],
        requirements: [],
      },
    });
    assertEquals(
      Object.values(assess(unknown, completeEvidence(unknown)).gates),
      [false, false, false, false, false, false],
    );
  }
});

Deno.test("an explicit return format overrides the source extension", () => {
  for (const [format, contentType] of Object.entries(mime)) {
    const contract = buildRequestContract({
      manifestSha256: sha,
      manifest: {
        ...manifest,
        forms: [form("Questionnaire.pdf", "pdf")],
        requestedDocuments: [],
        requirements: [{
          text: `Return Questionnaire in ${format.toUpperCase()} format.`,
          evidenceIds: ["email:output"],
        }],
      },
    });
    assertEquals(contract.requirements[0].acceptedContentTypes, [contentType]);
  }
});

Deno.test("unscoped or contradictory format instructions require human resolution", () => {
  for (
    const text of [
      "Return the form in PDF format.",
      "Complete at 100%.",
      "Return Carrier registration in PDF format and Carrier questionnaire in DOCX format.",
    ]
  ) {
    const contract = buildRequestContract({
      manifestSha256: sha,
      manifest: {
        ...manifest,
        requirements: [...manifest.requirements, {
          text,
          evidenceIds: ["email:ambiguous"],
        }],
      },
    });
    const matrix = assess(contract, completeEvidence(contract));
    assertEquals(
      matrix.items.some((item) => item.status === "review_required"),
      true,
    );
    assertEquals(Object.values(matrix.gates), [
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  }
});

Deno.test("explicit all-forms instructions are retained for every form", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: {
      ...manifest,
      requirements: [{
        text: "Complete all forms at 100%.",
        evidenceIds: ["email:all"],
      }],
    },
  });
  assertEquals(
    contract.requirements.slice(0, 4).map((item) =>
      item.minimumCompletionPercent
    ),
    [100, 100, 100, 100],
  );
  assertEquals(
    contract.requirements.slice(0, 4).map((item) => item.condition),
    ["always", "always", "always", "always"],
  );
});

Deno.test("mixed form and document instructions cannot silently discard or transfer constraints", () => {
  for (
    const text of [
      "Complete the form at 100% and provide W-9 in PDF format.",
      "Complete Questionnaire at 100% and provide W-9 in PDF format.",
      "Complete all forms at 100% and provide W-9 in PDF format.",
    ]
  ) {
    const contract = buildRequestContract({
      manifestSha256: sha,
      manifest: {
        ...manifest,
        forms: [form("Questionnaire", "docx")],
        requirements: [{ text, evidenceIds: ["email:mixed-instruction"] }],
      },
    });
    assertEquals(contract.requirements[0].condition, "unknown");
    assertEquals(
      Object.values(assess(contract, completeEvidence(contract)).gates),
      [false, false, false, false, false, false],
    );
  }
});
