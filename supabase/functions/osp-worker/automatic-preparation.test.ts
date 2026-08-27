import { assertEquals } from "jsr:@std/assert@1.0.14";

import {
  type AutomaticPreparationInput,
  createAutomaticPreparationService,
  prepareCaseForm,
} from "./automatic-preparation.ts";

const base: AutomaticPreparationInput = {
  caseId: "case-1",
  extractionId: "extraction-1",
  templateVersionId: "template-1",
  fields: [
    {
      fieldId: "legal_name",
      canonicalFieldId: "supplier.legalName",
      supplierAliases: ["Legal name"],
      required: true,
    },
    {
      fieldId: "tax_id",
      canonicalFieldId: "fiscal.taxIdentifier",
      supplierAliases: ["RFC"],
      required: true,
    },
  ],
  candidates: [
    {
      fieldKey: "supplier.legalName",
      value: "X Border Freight",
      source: "rateware",
      confidence: 1,
      validation: "valid",
      evidenceIds: ["rateware:company"],
    },
    {
      fieldKey: "RFC",
      value: "XBF010101AAA",
      source: "attachment",
      confidence: 0.98,
      validation: "valid",
      evidenceIds: ["sat:page-1"],
    },
  ],
  currentValues: {},
};

Deno.test("automatic preparation fills a complete draft and stops at Operations review", () => {
  assertEquals(prepareCaseForm(base), {
    status: "ready_for_operations_review",
    values: { legal_name: "X Border Freight", tax_id: "XBF010101AAA" },
    fields: [
      {
        fieldId: "legal_name",
        source: "rateware",
        status: "prepared",
        evidenceIds: ["rateware:company"],
      },
      {
        fieldId: "tax_id",
        source: "attachment",
        status: "prepared",
        evidenceIds: ["sat:page-1"],
      },
    ],
    externalEffects: false,
  });
});

Deno.test("Rateware wins precedence but a conflicting attachment forces clarification", () => {
  const plan = prepareCaseForm({
    ...base,
    candidates: [
      ...base.candidates,
      {
        fieldKey: "Legal name",
        value: "Different Company",
        source: "attachment",
        confidence: 0.99,
        validation: "valid",
        evidenceIds: ["request:page-2"],
      },
    ],
  });
  assertEquals(plan.status, "awaiting_clarification");
  assertEquals(plan.values.legal_name, "X Border Freight");
  assertEquals(plan.fields[0], {
    fieldId: "legal_name",
    source: "rateware",
    status: "contradictory",
    evidenceIds: ["rateware:company", "request:page-2"],
  });
  assertEquals(plan.externalEffects, false);
});

Deno.test("a missing required canonical fact waits for XBF information", () => {
  const plan = prepareCaseForm({
    ...base,
    candidates: base.candidates.filter((candidate) =>
      candidate.fieldKey !== "supplier.legalName"
    ),
  });
  assertEquals(plan.status, "awaiting_xbf_information");
  assertEquals(plan.fields[0].status, "missing");
});

Deno.test("low-confidence values never enter the prepared form", () => {
  const plan = prepareCaseForm({
    ...base,
    candidates: base.candidates.map((candidate) =>
      candidate.fieldKey === "RFC"
        ? { ...candidate, confidence: 0.79 }
        : candidate
    ),
  });
  assertEquals(plan.status, "awaiting_xbf_information");
  assertEquals(Object.hasOwn(plan.values, "tax_id"), false);
});

Deno.test("the service persists one no-effects plan with the job correlation", async () => {
  const persisted: unknown[] = [];
  const service = createAutomaticPreparationService({
    load: async () => base,
    persist: async (input) => {
      persisted.push(input);
    },
  });
  const plan = await service.prepare({
    organizationId: "org-1",
    caseId: base.caseId,
    extractionId: base.extractionId,
    templateVersionId: base.templateVersionId,
    correlationId: "job-1",
  });
  assertEquals(plan.status, "ready_for_operations_review");
  assertEquals(persisted, [{
    organizationId: "org-1",
    caseId: base.caseId,
    extractionId: base.extractionId,
    templateVersionId: base.templateVersionId,
    correlationId: "job-1",
    plan,
  }]);
});
