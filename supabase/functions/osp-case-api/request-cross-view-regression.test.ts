import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

import {
  buildRequestContract,
  evaluateRequestFulfillment,
} from "../_shared/osp/request-contract.ts";
import { buildClarificationDraft } from "../osp-worker/clarification-draft.ts";
import { requestManifestDecisionSeeds } from "./request-manifest-review.ts";

const sha = "a".repeat(64);

type SyntheticCase = Readonly<{
  name: string;
  caseId: string;
  evidenceId: string;
  manifest: Record<string, unknown>;
  expectedDocumentKeys: readonly string[];
}>;

const salzillo: SyntheticCase = {
  name: "Salzillo",
  caseId: "case-salzillo-cross-view",
  evidenceId: "email:salzillo",
  manifest: {
    requestType: "customer_setup",
    targetXbfEntity: "XBFMX",
    forms: [{
      name: "Formato Información 3.3",
      format: "xlsm",
      action: "sign",
      required: true,
      evidenceIds: ["email:salzillo"],
    }],
    requestedDocuments: [{
      documentType: "Constancia de situación fiscal",
      required: true,
      acceptableAlternatives: [],
      evidenceIds: ["email:salzillo"],
    }],
    requirements: [{
      text: "Formato 3.3 firmado en PDF y llenar las dos páginas al 100%",
      evidenceIds: ["email:salzillo"],
    }, {
      text: "Constancia de situación fiscal con antigüedad máxima de un mes",
      evidenceIds: ["email:salzillo"],
    }, {
      text: "Carátula del banco emisor con antigüedad máxima de un mes",
      evidenceIds: ["email:salzillo"],
    }],
    clarificationQuestions: [{
      fieldId: "supplier.legal_name",
      question: "Confirma la razón social exacta para el alta.",
      evidenceIds: ["email:salzillo"],
    }],
    contradictions: [{
      text: "El correo indica XBFMX, pero el formulario menciona XBFUS.",
      evidenceIds: ["email:salzillo"],
    }],
    missingInformation: [{
      fieldId: "supplier.legal_name",
      description: "Falta la razón social legal del proveedor.",
      evidenceIds: ["email:salzillo"],
    }, {
      fieldId: "supplier.legal_name",
      description: "Falta confirmar la razón social que debe firmar.",
      evidenceIds: ["email:salzillo"],
    }],
  },
  expectedDocumentKeys: [
    "fiscal.tax_status_certificate",
    "banking.account_evidence",
  ],
};

const crane: SyntheticCase = {
  name: "Crane",
  caseId: "case-crane-cross-view",
  evidenceId: "email:crane",
  manifest: {
    requestType: "customer_setup",
    targetXbfEntity: "XBFUS",
    forms: [{
      name: "Carrier onboarding packet",
      format: "docx",
      action: "complete",
      required: true,
      evidenceIds: ["email:crane"],
    }],
    requestedDocuments: [{
      documentType: "W-9",
      required: true,
      acceptableAlternatives: [],
      evidenceIds: ["email:crane"],
    }, {
      documentType: "Broker authority",
      required: true,
      acceptableAlternatives: [],
      evidenceIds: ["email:crane"],
    }],
    requirements: [{
      text: "Return the completed onboarding packet in DOCX format.",
      evidenceIds: ["email:crane"],
    }, {
      text: "Provide the current W-9 in PDF format.",
      evidenceIds: ["email:crane"],
    }, {
      text: "Provide MC authority and a surety bond.",
      evidenceIds: ["email:crane"],
    }],
    clarificationQuestions: [],
    contradictions: [],
    missingInformation: [{
      fieldId: "supplier.mc_number",
      description: "Falta el número MC vigente.",
      evidenceIds: ["email:crane"],
    }],
  },
  expectedDocumentKeys: [
    "fiscal.w9",
    "operations.broker_authority",
    "insurance.surety_bond",
  ],
};

function manifestQuestions(manifest: Record<string, unknown>) {
  const row = manifest as Record<string, unknown>;
  const missing = row.missingInformation as Array<Record<string, unknown>>;
  const contradictions = row.contradictions as Array<Record<string, unknown>>;
  return {
    missing: missing.map((item) => ({
      fieldId: item.fieldId as string,
      question: item.description as string,
      evidenceIds: item.evidenceIds as readonly string[],
    })),
    contradictions: contradictions.map((item, index) => ({
      // Clarification drafts require a field scope. A synthetic contradiction
      // scope keeps the source text and evidence intact without inventing a
      // supplier field that could be mistaken for a resolved value.
      fieldId: `contradiction.${index}`,
      question: item.text as string,
      evidenceIds: item.evidenceIds as readonly string[],
    })),
  };
}

for (const fixture of [salzillo, crane]) {
  Deno.test(`${fixture.name} requirements stay aligned across review views`, async () => {
    const seeds = requestManifestDecisionSeeds(fixture.manifest);
    const questions = manifestQuestions(fixture.manifest);
    const draft = await buildClarificationDraft({
      caseId: fixture.caseId,
      evidenceIds: [fixture.evidenceId],
      missing: questions.missing,
      contradictions: questions.contradictions,
    });
    const contract = buildRequestContract({
      manifestSha256: sha,
      manifest: fixture.manifest,
    });
    const matrix = evaluateRequestFulfillment({
      contract,
      evidence: [],
      entity: {
        legalEntityKind: fixture.name === "Salzillo" ? "company" : "company",
      },
      now: new Date("2026-09-07T12:00:00.000Z"),
    });

    // clarificationQuestions are already a separate source queue. The
    // clarification draft is intentionally scoped to missing/contradictory
    // conditions, so compare only that shared scope here.
    const seedPrompts = seeds
      .filter((seed) => seed.kind !== "clarification")
      .map((seed) => `${seed.kind}:${seed.prompt}`)
      .sort();
    const draftPrompts = draft.questions
      .map((question) => `${question.kind}:${question.question}`)
      .sort();
    assertEquals(seedPrompts, draftPrompts);

    const contractKeys = contract.requirements
      .filter((requirement) => requirement.kind === "document")
      .map((requirement) => requirement.canonicalKey);
    for (const expectedKey of fixture.expectedDocumentKeys) {
      assert(
        contractKeys.includes(expectedKey),
        `${fixture.name} lost document requirement ${expectedKey}`,
      );
    }
    assertEquals(
      matrix.items.map((item) => item.requirementId),
      contract.requirements.map((requirement) => requirement.id),
    );
    assertEquals(matrix.blockingCount, contract.requirements.length);
    assertEquals(matrix.gates.send, false);
  });
}

Deno.test("cross-view regression keeps an exact duplicate out of every queue", async () => {
  const manifest = {
    ...salzillo.manifest,
    clarificationQuestions: [
      ...(salzillo.manifest.clarificationQuestions as unknown[]),
      ...(salzillo.manifest.clarificationQuestions as unknown[]),
    ],
    missingInformation: [
      ...(salzillo.manifest.missingInformation as unknown[]),
      ...(salzillo.manifest.missingInformation as unknown[]),
    ],
  };
  const seeds = requestManifestDecisionSeeds(manifest);
  const questions = manifestQuestions(manifest);
  const draft = await buildClarificationDraft({
    caseId: "case-cross-view-dedup",
    evidenceIds: [salzillo.evidenceId],
    missing: questions.missing,
    contradictions: questions.contradictions,
  });
  assertEquals(seeds.length, 4);
  assertEquals(draft.questions.length, 3);
  assertEquals(
    new Set(seeds.map((seed) => `${seed.kind}:${seed.prompt}`)).size,
    seeds.length,
  );
  assertEquals(
    new Set(
      draft.questions.map((question) =>
        `${question.kind}:${question.question}`
      ),
    ).size,
    draft.questions.length,
  );
});
