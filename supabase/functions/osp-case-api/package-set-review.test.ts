// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert@1.0.14";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  type PackageMemberReview,
  preparePackageSetReview,
} from "./package-set-review.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const scope = {
    organizationId: id(1),
    caseId: id(2),
    snapshotSha256: "a".repeat(64),
  };
  const manifest = {
    schemaVersion: 1,
    ...scope,
    setId: id(3),
    snapshotId: id(4),
    version: 1,
    planSha256: "b".repeat(64),
    members: [5, 6].map((n) => ({
      requirementId: `file:${id(n)}`,
      objectId: `${id(1)}:${id(2)}:${id(3)}:${id(n)}`,
      artifact: {
        sourceVersionId: id(n),
        sourceSha256: "c".repeat(64),
        packageSnapshotId: id(4),
        packageSnapshotSha256: scope.snapshotSha256,
        version: 1,
        outputSha256: "d".repeat(64),
        contentType: "application/pdf",
      },
    })),
  };
  const manifestSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalPackageSetJson(manifest)),
  );
  return {
    ...scope,
    caseVersion: 7,
    receipt: { ...manifest, manifestSha256 },
    requestManifestSha256: "e".repeat(64),
    expectedSetManifestSha256: manifestSha256,
    reviews: [5, 6].map((n): PackageMemberReview => ({
      sourceVersionId: id(n),
      requirementId: `file:${id(n)}`,
      outputSha256: "d".repeat(64),
      reviewDecisionId: id(n + 10),
      status: "approved",
      completenessVerified: true,
      signatureRequirement: "none",
      signaturePolicyVersion: null,
    })),
  };
}
Deno.test("set review binds every original and decision without depending on review order", async () => {
  const input = await fixture();
  const result = await preparePackageSetReview(input);
  assertEquals(result.members.length, 2);
  assertEquals(
    await preparePackageSetReview({
      ...input,
      reviews: [...input.reviews].reverse(),
    }),
    result,
  );
  assertEquals(JSON.stringify(result).includes("objectId"), false);
});
for (
  const scenario of [
    "missing",
    "extra",
    "duplicate_source",
    "duplicate_decision",
    "pending",
    "rejected",
    "incomplete",
    "changed_output",
    "wrong_requirement",
    "stale_manifest",
    "bad_policy",
    "tenant",
  ] as const
) {
  Deno.test(`set review rejects ${scenario}`, async () => {
    const input = await fixture();
    if (scenario === "missing") input.reviews.pop();
    if (scenario === "extra") {
      input.reviews.push({ ...input.reviews[0], sourceVersionId: id(99) });
    }
    if (scenario === "duplicate_source") {
      input.reviews[1] = { ...input.reviews[0] };
    }
    if (scenario === "duplicate_decision") {
      input.reviews[1].reviewDecisionId = input.reviews[0].reviewDecisionId;
    }
    if (scenario === "pending" || scenario === "rejected") {
      input.reviews[1].status = scenario;
    }
    if (scenario === "incomplete") {
      input.reviews[1].completenessVerified = false;
    }
    if (scenario === "changed_output") {
      input.reviews[1].outputSha256 = "f".repeat(64);
    }
    if (scenario === "wrong_requirement") {
      input.reviews[1].requirementId = "form:other";
    }
    if (scenario === "stale_manifest") {
      input.expectedSetManifestSha256 = "f".repeat(64);
    }
    if (scenario === "bad_policy") {
      input.reviews[1].signatureRequirement = "image";
    }
    if (scenario === "tenant") input.organizationId = id(99);
    await assertRejects(() => preparePackageSetReview(input));
  });
}
Deno.test("case, request, review and signature policy changes invalidate the review digest", async () => {
  const input = await fixture();
  const initial = (await preparePackageSetReview(input)).reviewSha256;
  for (
    const change of [
      { ...input, caseVersion: 8 },
      { ...input, requestManifestSha256: "f".repeat(64) },
      {
        ...input,
        reviews: input.reviews.map((r) => ({
          ...r,
          reviewDecisionId: id(25 + Number(r.sourceVersionId.slice(-1))),
        })),
      },
      {
        ...input,
        reviews: input.reviews.map((r): PackageMemberReview => ({
          ...r,
          signatureRequirement: "autograph",
          signaturePolicyVersion: 1,
        })),
      },
    ]
  ) {
    assertNotEquals(
      (await preparePackageSetReview(change)).reviewSha256,
      initial,
    );
  }
  const autograph = await preparePackageSetReview({
    ...input,
    reviews: input.reviews.map((r): PackageMemberReview => ({
      ...r,
      signatureRequirement: "autograph",
      signaturePolicyVersion: 1,
    })),
  });
  assertEquals(
    autograph.members.every((m) => m.signatureRequirement === "autograph"),
    true,
  );
  assertEquals("approved" in autograph, false); // Preparation is never an executed approval/signature.
});
