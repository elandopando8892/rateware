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
  sourceSha256: string;
  outputSha256: string;
  requirementId: string;
  reviewDecisionId: string;
  // These are verified persisted decisions, never browser/LLM assertions.
  status: "approved" | "pending" | "rejected";
  completenessVerified: boolean;
  completionPercent: number;
  pageCount: number | null;
  signatureRequirement: "none" | "image" | "autograph";
  signaturePolicyVersion: number | null;
};

function completionMethod(
  file: Awaited<ReturnType<typeof parseWorkflowPackageSet>>["files"][number],
): "xlsx_cells" | "pdf_native" | "docx_content_controls" {
  const kinds = new Set(file.mappingKinds);
  if (
    file.contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.contentType === "application/vnd.ms-excel.sheet.macroEnabled.12"
  ) {
    if ([...kinds].some((kind) => kind !== "xlsx_cell")) fail();
    return "xlsx_cells";
  }
  if (file.contentType === "application/pdf") {
    // An appended answer sheet is supplemental evidence, never proof that the
    // supplier's original PDF was completed.
    if (
      kinds.has("pdf_appendix") ||
      [...kinds].some((kind) => kind !== "acroform" && kind !== "pdf_overlay")
    ) fail();
    return "pdf_native";
  }
  if (
    kinds.has("docx_appendix") ||
    [...kinds].some((kind) => kind !== "docx_content_control")
  ) fail();
  return "docx_content_controls";
}

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
      !SHA.test(review.sourceSha256) || !SHA.test(review.outputSha256) ||
      bySource.has(review.sourceVersionId) ||
      decisions.has(review.reviewDecisionId) || review.status !== "approved" ||
      review.completenessVerified !== true ||
      !Number.isSafeInteger(review.completionPercent) ||
      review.completionPercent < 0 || review.completionPercent > 100 ||
      (review.pageCount !== null &&
        (!Number.isSafeInteger(review.pageCount) || review.pageCount < 1 ||
          review.pageCount > 1000)) ||
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
      review.sourceSha256 !== file.sourceSha256 ||
      review.requirementId !== file.requirementId
    ) fail();
    return {
      sourceVersionId: file.sourceVersionId,
      sourceSha256: file.sourceSha256,
      requirementId: file.requirementId,
      outputSha256: file.outputSha256,
      contentType: file.contentType,
      artifactRole: "completed_original" as const,
      completionMethod: completionMethod(file),
      reviewDecisionId: review.reviewDecisionId,
      completionPercent: review.completionPercent,
      pageCount: review.pageCount,
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
