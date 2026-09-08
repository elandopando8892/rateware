import {
  type SqlPort,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type {
  ApprovalActor,
  ApprovalResult,
} from "../_shared/osp/approval-types.ts";
import { requireApprovalAuthority } from "../_shared/osp/approval-policy.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { preparePackageSetReview } from "./package-set-review.ts";
import { loadLockedPackageSetReview } from "./package-set-review-source.ts";

type ReviewContext = Parameters<typeof preparePackageSetReview>[0];
export type PackageSetReviewCommand = {
  organizationId: string;
  caseId: string;
  expectedCaseVersion: number;
  expectedSnapshotSha256: string;
  expectedReviewSha256: string;
  idempotencyKey: string;
  actor: ApprovalActor;
};

/** A production loader MUST lock case/current set and relevant source/review
 * rows, verify the latest resolved request contract and semantic completeness,
 * and return persisted decisions. It must use this transaction, not another pool.
 * HTTP wiring remains disabled. The default loader reads persisted final-output reviews.
 */
export type LockedPackageSetReviewSource = (
  tx: SqlPort,
  command: PackageSetReviewCommand,
) => Promise<ReviewContext>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
function fail(code = "PACKAGE_SET_REVIEW_BLOCKED"): never {
  throw new Error(code);
}
function result(
  value: unknown,
  command: PackageSetReviewCommand,
  replayed: boolean,
): ApprovalResult {
  if (!value || typeof value !== "object") fail();
  const row = value as Record<string, unknown>;
  if (
    row.caseId !== command.caseId || row.state !== "signature_approval" ||
    row.caseVersion !== command.expectedCaseVersion + 1
  ) fail();
  return {
    caseId: command.caseId,
    state: "signature_approval",
    caseVersion: command.expectedCaseVersion + 1,
    replayed,
  };
}

export function createPackageSetOperationsReviewStore(deps: {
  sql: SqlPort;
  loadLocked?: LockedPackageSetReviewSource;
  now?: () => Date;
}) {
  return {
    async complete(command: PackageSetReviewCommand): Promise<ApprovalResult> {
      if (
        !command || !UUID.test(command.organizationId) ||
        !UUID.test(command.caseId) ||
        !Number.isSafeInteger(command.expectedCaseVersion) ||
        command.expectedCaseVersion < 0 ||
        command.expectedCaseVersion >= 2_147_483_647 ||
        !SHA.test(command.expectedSnapshotSha256) ||
        !SHA.test(command.expectedReviewSha256) ||
        !/^[A-Za-z0-9:_-]{1,256}$/.test(command.idempotencyKey) ||
        command.actor?.organizationId !== command.organizationId
      ) fail();
      requireApprovalAuthority(
        command.actor,
        "complete_operations_review",
        deps.now?.(),
      );
      const {
        authorizationSessionId: _session,
        authorizationSessionIssuedAt: _issued,
        ...principal
      } = command.actor;
      const hash = await sha256Hex(
        new TextEncoder().encode(
          canonicalPackageSetJson({
            type: "complete_package_set_operations_review",
            ...command,
            actor: principal,
          }),
        ),
      );
      return await withOrganizationTransaction(
        deps.sql,
        command.organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const lock = canonicalPackageSetJson([
            command.organizationId,
            "package-set-review",
            command.idempotencyKey,
          ]);
          await tx`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
          const prior =
            await tx`select command_sha256, review_sha256, result_json from osp_private.package_set_operations_reviews where organization_id = ${command.organizationId}::uuid and idempotency_key = ${command.idempotencyKey}`;
          if (prior.length) {
            if (
              prior.length !== 1 || prior[0].command_sha256 !== hash ||
              prior[0].review_sha256 !== command.expectedReviewSha256
            ) fail("IDEMPOTENCY_CONFLICT");
            return result(prior[0].result_json, command, true);
          }
          const context = await (deps.loadLocked ?? loadLockedPackageSetReview)(
            tx,
            command,
          );
          if (
            context.organizationId !== command.organizationId ||
            context.caseId !== command.caseId ||
            context.caseVersion !== command.expectedCaseVersion ||
            context.snapshotSha256 !== command.expectedSnapshotSha256
          ) fail();
          const basis = await preparePackageSetReview(context);
          if (basis.reviewSha256 !== command.expectedReviewSha256) {
            fail(
              "PACKAGE_SET_REVIEW_STALE",
            );
          }
          // Reuse the existing actor, snapshot, version, transition and audit checks.
          // Any later failure rolls this command and its event back in this same tx.
          const permissions = "{" +
            command.actor.permissions.map((p) =>
              '"' + p.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"'
            ).join(",") + "}";
          const rows =
            await tx`select * from osp_private.complete_operations_review_command(${command.organizationId}::uuid, ${command.caseId}::uuid, ${command.expectedSnapshotSha256}, ${command.expectedCaseVersion}::bigint, ${command.actor.subject}, ${command.actor.verifiedEmail}, ${permissions}::text[], ${command.actor.role}, ${command.actor.authorizationSessionId}, ${command.actor.authorizationSessionIssuedAt}::timestamptz, ${hash})`;
          if (rows.length !== 1) fail();
          const completed = result(
            {
              caseId: rows[0].case_id,
              state: rows[0].state,
              caseVersion: Number(rows[0].case_version),
            },
            command,
            false,
          );
          await tx`insert into osp_private.package_set_operations_reviews (id, organization_id, case_id, package_set_id, idempotency_key, command_sha256, review_sha256, basis_json, actor_json, result_json) values (${crypto.randomUUID()}::uuid, ${command.organizationId}::uuid, ${command.caseId}::uuid, ${basis.setId}::uuid, ${command.idempotencyKey}, ${hash}, ${basis.reviewSha256}, ${
            JSON.stringify(basis)
          }::text::jsonb, ${JSON.stringify(command.actor)}::text::jsonb, ${
            JSON.stringify(completed)
          }::text::jsonb)`;
          return completed;
        },
      );
    },
  };
}
