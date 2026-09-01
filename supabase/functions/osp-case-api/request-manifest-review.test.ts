import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  buildRequestManifestDecisionReview,
  requestManifestDecisionSeeds,
} from "./request-manifest-review.ts";

const manifest = {
  clarificationQuestions: [{
    fieldId: "company.president",
    question: "Who is the company president?",
    evidenceIds: ["pdf:page-1"],
  }],
  contradictions: [{
    text: "The incorporation date conflicts with the form metadata.",
    evidenceIds: ["pdf:page-2"],
  }],
  missingInformation: [
    {
      fieldId: "company.president",
      description: "President is missing.",
      evidenceIds: ["pdf:page-1"],
    },
    {
      fieldId: "submission.method",
      description: "Submission method is missing.",
      evidenceIds: [],
    },
  ],
};

Deno.test("request manifest decisions deduplicate missing fields already covered by a clarification", () => {
  assertEquals(requestManifestDecisionSeeds(manifest), [
    {
      decisionId: "clarification:0",
      kind: "clarification",
      fieldId: "company.president",
      prompt: "Who is the company president?",
      evidenceIds: ["pdf:page-1"],
    },
    {
      decisionId: "contradiction:0",
      kind: "contradiction",
      fieldId: null,
      prompt: "The incorporation date conflicts with the form metadata.",
      evidenceIds: ["pdf:page-2"],
    },
    {
      decisionId: "missing:1",
      kind: "missing",
      fieldId: "submission.method",
      prompt: "Submission method is missing.",
      evidenceIds: [],
    },
  ]);
});

Deno.test("request manifest review is canonical and external decisions keep the case blocked", async () => {
  const review = await buildRequestManifestDecisionReview({
    manifest,
    decisions: [
      {
        decisionId: "clarification:0",
        outcome: "answered",
        resolution: "José Andrés González Perales.",
      },
      {
        decisionId: "contradiction:0",
        outcome: "not_applicable",
        resolution: "Use the verified Entity Vault incorporation date.",
      },
      {
        decisionId: "missing:1",
        outcome: "external",
        resolution: "Carrier must confirm the submission channel.",
      },
    ],
  });
  assertEquals(review.status, "needs_external_clarification");
  assertEquals(review.decisions.length, 3);
  assertEquals(review.canonicalSha256.length, 64);
});

Deno.test("request manifest review requires one exact decision for every source exception", async () => {
  await assertRejects(
    () =>
      buildRequestManifestDecisionReview({
        manifest,
        decisions: [
          {
            decisionId: "clarification:0",
            outcome: "answered",
            resolution: "Known answer.",
          },
        ],
      }),
    Error,
    "REQUEST_MANIFEST_REVIEW_SCOPE_MISMATCH",
  );
});
