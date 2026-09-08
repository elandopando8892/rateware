import {
  type SqlPort,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type { ApprovalActor } from "../_shared/osp/approval-types.ts";
import { requireApprovalAuthority } from "../_shared/osp/approval-policy.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";

export type SavePackageMemberReviewCommand = {
  reviewId: string;
  organizationId: string;
  caseId: string;
  setId: string;
  sourceVersionId: string;
  expectedCaseVersion: number;
  inputSnapshotSha256: string;
  setManifestSha256: string;
  requestManifestSha256: string;
  outputSha256: string;
  status: "approved" | "rejected";
  fullOutputInspected: boolean;
  completionPercent: number | null;
  pageCount: number | null;
  signatureRequirement: "none" | "image" | "autograph";
  signaturePolicyVersion: number | null;
  actor: ApprovalActor;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const integer = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min &&
  value <= max;

/** Internal application port. Actor must come from verified authentication, never JSON input.
 * Records inspection only; does not complete Operations, sign, authorize or send.
 */
export function createPackageMemberReviewStore(
  deps: { sql: SqlPort; now?: () => Date },
) {
  return {
    async save(command: SavePackageMemberReviewCommand) {
      if (
        !command ||
        [
          command.reviewId,
          command.organizationId,
          command.caseId,
          command.setId,
          command.sourceVersionId,
        ].some((v) => typeof v !== "string" || !UUID.test(v)) ||
        [
          command.inputSnapshotSha256,
          command.setManifestSha256,
          command.requestManifestSha256,
          command.outputSha256,
        ].some((v) => typeof v !== "string" || !SHA.test(v)) ||
        !integer(command.expectedCaseVersion, 0, 2147483646) ||
        !["approved", "rejected"].includes(command.status) ||
        typeof command.fullOutputInspected !== "boolean" ||
        (command.completionPercent !== null &&
          !integer(command.completionPercent, 0, 100)) ||
        (command.pageCount !== null && !integer(command.pageCount, 1, 1000)) ||
        (command.status === "approved" &&
          (!command.fullOutputInspected ||
            command.completionPercent === null)) ||
        !["none", "image", "autograph"].includes(
          command.signatureRequirement,
        ) ||
        (command.signatureRequirement === "none"
          ? command.signaturePolicyVersion !== null
          : !integer(command.signaturePolicyVersion, 1, 2147483647)) ||
        command.actor?.organizationId !== command.organizationId
      ) throw new Error("INVALID_MEMBER_REVIEW");
      requireApprovalAuthority(
        command.actor,
        "complete_operations_review",
        deps.now?.(),
      );
      // Bind the evidence to its authenticated actor/session as well as exact bytes.
      const digest = await sha256Hex(
        new TextEncoder().encode(
          canonicalPackageSetJson({
            type: "save_package_member_review",
            ...command,
          }),
        ),
      );
      return await withOrganizationTransaction(
        deps.sql,
        command.organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const key =
            `${command.organizationId}:member-review:${command.reviewId}`;
          await tx`select pg_advisory_xact_lock(hashtextextended(${key},0))`;
          const prior =
            await tx`select command_sha256,review_version from osp_private.package_set_member_reviews where organization_id=${command.organizationId}::uuid and id=${command.reviewId}::uuid`;
          if (prior.length) {
            if (
              prior.length !== 1 || prior[0].command_sha256 !== digest
            ) throw new Error("IDEMPOTENCY_CONFLICT");
            return {
              reviewId: command.reviewId,
              reviewVersion: Number(prior[0].review_version),
              replayed: true,
            };
          }
          await tx`select osp_private.lock_package_set_operations_context(${command.organizationId}::uuid,${command.caseId}::uuid,${command.expectedCaseVersion}::bigint,${command.inputSnapshotSha256})`;
          const currentSet =
            await tx`select id from osp_private.supplier_package_sets
            where organization_id=${command.organizationId}::uuid and case_id=${command.caseId}::uuid
              and id=${command.setId}::uuid and status='current'
              and input_snapshot_sha256=${command.inputSnapshotSha256}
              and input_snapshot_id=(select id from osp_private.case_package_input_snapshots
                where organization_id=${command.organizationId}::uuid and case_id=${command.caseId}::uuid
                  and case_version=${command.expectedCaseVersion}::bigint order by created_at desc,id desc limit 1)`;
          if (currentSet.length !== 1) {
            throw new Error("PACKAGE_SET_REVIEW_STALE");
          }
          // The database insert guard rechecks current set/request/output and actor.
          const rows =
            await tx`insert into osp_private.package_set_member_reviews
          (id,organization_id,case_id,package_set_id,source_version_id,review_version,set_manifest_sha256,request_manifest_sha256,output_sha256,status,full_output_inspected,completion_percent,page_count,signature_requirement,signature_policy_version,actor_json,command_sha256)
          select ${command.reviewId}::uuid,${command.organizationId}::uuid,${command.caseId}::uuid,${command.setId}::uuid,${command.sourceVersionId}::uuid,coalesce(max(review_version),0)+1,${command.setManifestSha256},${command.requestManifestSha256},${command.outputSha256},${command.status},${command.fullOutputInspected},${command.completionPercent}::integer,${command.pageCount}::integer,${command.signatureRequirement},${command.signaturePolicyVersion}::integer,${
              JSON.stringify(command.actor)
            }::jsonb,${digest}
          from osp_private.package_set_member_reviews where organization_id=${command.organizationId}::uuid and package_set_id=${command.setId}::uuid and source_version_id=${command.sourceVersionId}::uuid
          returning review_version`;
          if (rows.length !== 1) throw new Error("MEMBER_REVIEW_WRITE_FAILED");
          return {
            reviewId: command.reviewId,
            reviewVersion: Number(rows[0].review_version),
            replayed: false,
          };
        },
      );
    },
  };
}
