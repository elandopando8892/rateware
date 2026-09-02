import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  assertRequestSemanticGate,
  buildRequestContract,
  evaluateRequestFulfillment,
  type FulfillmentEvidence,
} from "./request-contract.ts";

const sha = "a".repeat(64);
const salzilloManifest = Object.freeze({
  requestType: "customer_setup",
  targetXbfEntity: "XBFMX",
  forms: [{
    name: "Formato Información 3.3",
    format: "xlsm",
    action: "sign",
    required: true,
    evidenceIds: ["email:salzillo"],
  }],
  requestedDocuments: [
    "Copia del acta constitutiva (solo para personas morales)",
    "INE del Representante Legal",
    "Poder Notarial (en caso de ser persona moral)",
    "Opinión positiva expedida por el SAT",
    "Constancia de situación fiscal",
    "Carátula del banco emisor de sus pagos en mxn",
    "Comprobante de domicilio",
  ].map((documentType) => ({
    documentType,
    required: true,
    acceptableAlternatives: [],
    evidenceIds: ["email:salzillo"],
  })),
  requirements: [
    {
      id: "form",
      text:
        "Llenado completo y correcto del Formato 3.3, firma autógrafa, compartir en formato PDF y llenar las dos páginas al 100%",
      evidenceIds: ["email:salzillo"],
    },
    {
      id: "opinion",
      text:
        "Opinión positiva expedida por el SAT con antigüedad máxima de un mes",
      evidenceIds: ["email:salzillo"],
    },
    {
      id: "tax",
      text: "Constancia de situación fiscal con antigüedad máxima de un mes",
      evidenceIds: ["email:salzillo"],
    },
    {
      id: "bank",
      text: "Carátula del banco emisor con antigüedad máxima de un mes",
      evidenceIds: ["email:salzillo"],
    },
    {
      id: "address",
      text: "Comprobante de domicilio con vigencia de 3 meses de antigüedad",
      evidenceIds: ["email:salzillo"],
    },
  ],
});

Deno.test("Salzillo contract preserves form, condition, freshness, page and wet-signature constraints", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  assertEquals(contract.requirements.length, 8);
  const form = contract.requirements[0];
  assertEquals(form.acceptedContentTypes, ["application/pdf"]);
  assertEquals(form.minimumPageCount, 2);
  assertEquals(form.minimumCompletionPercent, 100);
  assertEquals(form.signatureMethod, "wet");
  assertEquals(
    contract.requirements.find((item) =>
      item.canonicalKey === "legal.articles_of_incorporation"
    )?.condition,
    "legal_entity_is_company",
  );
  assertEquals(
    contract.requirements.find((item) =>
      item.canonicalKey === "legal.power_of_attorney"
    )?.condition,
    "legal_entity_is_company",
  );
  assertEquals(
    contract.requirements.find((item) =>
      item.canonicalKey === "fiscal.sat_compliance_opinion"
    )?.maximumAgeDays,
    31,
  );
  assertEquals(
    contract.requirements.find((item) =>
      item.canonicalKey === "legal.proof_of_address"
    )?.maximumAgeDays,
    93,
  );
});

Deno.test("four filled cells and one attachment cannot pass the Salzillo semantic gate", async () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  const evidence: FulfillmentEvidence[] = [{
    evidenceId: "artifact:form-v1",
    canonicalKey: contract.requirements[0].canonicalKey,
    label: "Prefilled worksheet",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "approved",
    validFrom: null,
    expiresAt: null,
    pageCount: 2,
    completionPercent: 1.23,
    signatureMethod: "digital",
    includedForOutbound: true,
  }];
  const matrix = evaluateRequestFulfillment({
    contract,
    evidence,
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-02T12:00:00.000Z"),
  });
  assertEquals(matrix.totalRequired, 8);
  assertEquals(matrix.satisfiedRequired, 0);
  assertEquals(matrix.blockingCount, 8);
  assertEquals(matrix.gates.send, false);
  await assertRejects(
    () =>
      assertRequestSemanticGate({ load: async () => matrix }, {
        organizationId: "11111111-1111-4111-8111-111111111111",
        caseId: "22222222-2222-4222-8222-222222222222",
        stage: "send",
      }),
    Error,
    "REQUEST_FULFILLMENT_BLOCKED",
  );
});

Deno.test("complete, current, reviewed Salzillo evidence opens every gate", async () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  const evidence: FulfillmentEvidence[] = contract.requirements.map((
    requirement,
    index,
  ) => ({
    evidenceId: `artifact:item-${index + 1}`,
    canonicalKey: requirement.canonicalKey,
    label: requirement.label,
    contentType: requirement.kind === "form"
      ? "application/pdf"
      : "application/pdf",
    status: "approved" as const,
    validFrom: requirement.maximumAgeDays === null ? null : "2026-08-20",
    expiresAt: null,
    pageCount: requirement.minimumPageCount,
    completionPercent: requirement.minimumCompletionPercent,
    signatureMethod: requirement.signatureMethod,
    includedForOutbound: true,
  }));
  const matrix = evaluateRequestFulfillment({
    contract,
    evidence,
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-02T12:00:00.000Z"),
  });
  assertEquals(matrix.blockingCount, 0);
  assertEquals(matrix.satisfiedRequired, 8);
  assertEquals(matrix.gates, {
    operationsReview: true,
    signatureApproval: true,
    outboundDraft: true,
    outboundFreeze: true,
    salesAuthorization: true,
    send: true,
  });
  await assertRequestSemanticGate({ load: async () => matrix }, {
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    stage: "send",
  });
});

Deno.test("a complete XLSM can enter controlled signing while final-response gates remain closed", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  const evidence: FulfillmentEvidence[] = contract.requirements.map((
    requirement,
    index,
  ) => ({
    evidenceId: `artifact:pre-sign-${index + 1}`,
    canonicalKey: requirement.canonicalKey,
    label: requirement.label,
    contentType: requirement.kind === "form"
      ? "application/vnd.ms-excel.sheet.macroEnabled.12"
      : "application/pdf",
    status: "approved" as const,
    validFrom: requirement.maximumAgeDays === null ? null : "2026-08-20",
    expiresAt: null,
    pageCount: requirement.minimumPageCount,
    completionPercent: requirement.minimumCompletionPercent,
    signatureMethod: "none" as const,
    includedForOutbound: false,
  }));
  const matrix = evaluateRequestFulfillment({
    contract,
    evidence,
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-02T12:00:00.000Z"),
  });
  assertEquals(matrix.items[0].status, "wrong_format");
  assertEquals(matrix.gates, {
    operationsReview: true,
    signatureApproval: true,
    outboundDraft: false,
    outboundFreeze: false,
    salesAuthorization: false,
    send: false,
  });
});

Deno.test("Salzillo 98.25 percent coverage remains blocked because the carrier requested 100 percent", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  const form = contract.requirements[0];
  const matrix = evaluateRequestFulfillment({
    contract: { ...contract, requirements: [form] },
    evidence: [{
      evidenceId: "artifact:salzillo-98-25",
      canonicalKey: form.canonicalKey,
      label: form.label,
      contentType: "application/pdf",
      status: "approved",
      validFrom: null,
      expiresAt: null,
      pageCount: 2,
      completionPercent: 98.25,
      signatureMethod: "wet",
      includedForOutbound: true,
    }],
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-02T12:00:00.000Z"),
  });
  assertEquals(matrix.items[0].status, "incomplete");
  assertEquals(matrix.gates.send, false);
});

Deno.test("a stale document cannot mask a second current approved version of the same requirement", () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  const target = contract.requirements.find((requirement) =>
    requirement.canonicalKey === "fiscal.tax_status_certificate"
  )!;
  const matrix = evaluateRequestFulfillment({
    contract: {
      ...contract,
      requirements: [target],
    },
    evidence: [{
      evidenceId: "document:stale-tax-status",
      canonicalKey: target.canonicalKey,
      label: "Stale tax status",
      contentType: "application/pdf",
      status: "approved",
      validFrom: "2026-01-01",
      expiresAt: null,
      pageCount: null,
      completionPercent: null,
      signatureMethod: "none",
      includedForOutbound: true,
    }, {
      evidenceId: "document:current-tax-status",
      canonicalKey: target.canonicalKey,
      label: "Current tax status",
      contentType: "application/pdf",
      status: "approved",
      validFrom: "2026-08-20",
      expiresAt: null,
      pageCount: null,
      completionPercent: null,
      signatureMethod: "none",
      includedForOutbound: true,
    }],
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-02T12:00:00.000Z"),
  });
  assertEquals(matrix.items[0].status, "satisfied");
  assertEquals(matrix.items[0].evidenceIds, ["document:current-tax-status"]);
});

Deno.test("reviewed evidence outside the exact payload blocks final gates but not Operations or signing", async () => {
  const contract = buildRequestContract({
    manifestSha256: sha,
    manifest: salzilloManifest,
  });
  const evidence: FulfillmentEvidence[] = contract.requirements.map((
    requirement,
    index,
  ) => ({
    evidenceId: `artifact:outside-payload-${index + 1}`,
    canonicalKey: requirement.canonicalKey,
    label: requirement.label,
    contentType: "application/pdf",
    status: "approved" as const,
    validFrom: requirement.maximumAgeDays === null ? null : "2026-08-20",
    expiresAt: null,
    pageCount: requirement.minimumPageCount,
    completionPercent: requirement.minimumCompletionPercent,
    signatureMethod: requirement.signatureMethod,
    includedForOutbound: false,
  }));
  const matrix = evaluateRequestFulfillment({
    contract,
    evidence,
    entity: { legalEntityKind: "company" },
    now: new Date("2026-09-02T12:00:00.000Z"),
  });
  assertEquals(
    matrix.items.every((item) => item.status === "not_attached"),
    true,
  );
  assertEquals(matrix.gates, {
    operationsReview: true,
    signatureApproval: true,
    outboundDraft: true,
    outboundFreeze: false,
    salesAuthorization: false,
    send: false,
  });
  await assertRequestSemanticGate({ load: async () => matrix }, {
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    stage: "signature_approval",
  });
  await assertRejects(
    () =>
      assertRequestSemanticGate({ load: async () => matrix }, {
        organizationId: "11111111-1111-4111-8111-111111111111",
        caseId: "22222222-2222-4222-8222-222222222222",
        stage: "outbound_freeze",
      }),
    Error,
    "REQUEST_FULFILLMENT_BLOCKED",
  );
});
