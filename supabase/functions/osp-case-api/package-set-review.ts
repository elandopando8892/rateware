import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { parseWorkflowPackageSet } from "./workflow-package-set.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
function fail(): never {
  throw new Error("PACKAGE_SET_REVIEW_BLOCKED");
}

export type PackageMemberReview = {
  sourceVersionId: string;
  outputSha256: string;
  requirementId: string;
  reviewDecisionId: string;
  // These are verified persisted decisions, never browser/LLM assertions.
  status: "approved" | "pending" | "rejected";
  completenessVerified: boolean;
  signatureRequirement: "none" | "image" | "autograph";
  signaturePolicyVersion: number | null;
};

/** Prepare an exact review basis, not an approval or signature. The caller must
 * load receipt and decisions in the same locked transaction and persist this
 * digest with the authorized actor before any later workflow transition.
 * No route currently accepts these trusted inputs from the browser.
 */
export async function preparePackageSetReview(input: {
  receipt: unknown;
  organizationId: string;
  caseId: string;
  caseVersion: number;
  snapshotSha256: string;
  requestManifestSha256: string;
  expectedSetManifestSha256: string;
  reviews: readonly PackageMemberReview[];
}) {
  if (
    !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !Number.isSafeInteger(input.caseVersion) || input.caseVersion < 0 ||
    input.caseVersion > 2_147_483_647 ||
    ![
      input.snapshotSha256,
      input.requestManifestSha256,
      input.expectedSetManifestSha256,
    ].every((value) => SHA.test(value)) ||
    !Array.isArray(input.reviews) || input.reviews.length < 1 ||
    input.reviews.length > 20
  ) fail();
  const set = await parseWorkflowPackageSet(input.receipt, input);
  if (
    set.manifestSha256 !== input.expectedSetManifestSha256 ||
    set.files.length !== input.reviews.length
  ) fail();
  const bySource = new Map<string, PackageMemberReview>();
  const decisions = new Set<string>();
  for (const review of input.reviews) {
    if (
      !review || !UUID.test(review.sourceVersionId) ||
      !UUID.test(review.reviewDecisionId) ||
      !SHA.test(review.outputSha256) || bySource.has(review.sourceVersionId) ||
      decisions.has(review.reviewDecisionId) || review.status !== "approved" ||
      review.completenessVerified !== true ||
      !["none", "image", "autograph"].includes(review.signatureRequirement) ||
      (review.signatureRequirement === "none"
        ? review.signaturePolicyVersion !== null
        : !Number.isSafeInteger(review.signaturePolicyVersion) ||
          Number(review.signaturePolicyVersion) < 1 ||
          Number(review.signaturePolicyVersion) > 2_147_483_647)
    ) fail();
    bySource.set(review.sourceVersionId, review);
    decisions.add(review.reviewDecisionId);
  }
  const members = set.files.map((file) => {
    const review = bySource.get(file.sourceVersionId);
    if (
      !review || review.outputSha256 !== file.outputSha256 ||
      review.requirementId !== file.requirementId
    ) fail();
    return {
      sourceVersionId: file.sourceVersionId,
      requirementId: file.requirementId,
      outputSha256: file.outputSha256,
      contentType: file.contentType,
      reviewDecisionId: review.reviewDecisionId,
      signatureRequirement: review.signatureRequirement,
      signaturePolicyVersion: review.signaturePolicyVersion,
    };
  }).sort((left, right) =>
    left.sourceVersionId.localeCompare(right.sourceVersionId)
  );
  const basis = {
    schemaVersion: 1,
    organizationId: input.organizationId,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    snapshotSha256: input.snapshotSha256,
    requestManifestSha256: input.requestManifestSha256,
    setId: set.setId,
    setVersion: set.version,
    setManifestSha256: set.manifestSha256,
    members,
  };
  const reviewSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalPackageSetJson(basis)),
  );
  return { ...basis, reviewSha256 };
}
