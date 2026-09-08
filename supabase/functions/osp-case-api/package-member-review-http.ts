import { OspApiError } from "../osp-read-api/http.ts";
import type { SavePackageMemberReviewCommand } from "./package-member-review-store.ts";

export type MemberReviewInput = Omit<
  SavePackageMemberReviewCommand,
  "actor" | "organizationId"
>;
const KEYS = [
  "reviewId",
  "caseId",
  "setId",
  "sourceVersionId",
  "expectedCaseVersion",
  "inputSnapshotSha256",
  "setManifestSha256",
  "requestManifestSha256",
  "outputSha256",
  "status",
  "fullOutputInspected",
  "completionPercent",
  "pageCount",
  "signatureRequirement",
  "signaturePolicyVersion",
].sort();

/** Bounded stream; reject client-supplied authority and unknown fields. */
export async function readMemberReviewInput(
  request: Request,
): Promise<MemberReviewInput> {
  const invalid = (): never => {
    throw new OspApiError("INVALID_REQUEST");
  };
  if (
    request.headers.get("content-type") !== "application/json" ||
    request.headers.has("content-encoding") ||
    request.headers.has("transfer-encoding") || !request.body
  ) invalid();
  const limit = 8192;
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/.test(declared) || Number(declared) < 1 ||
      Number(declared) > limit)
  ) invalid();
  const reader = request.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        invalid();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size || (declared !== null && Number(declared) !== size)) invalid();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid();
  }
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== KEYS.join(",")
  ) invalid();
  // Domain types, ranges, hashes and attestations are checked by the store.
  return value as MemberReviewInput;
}
