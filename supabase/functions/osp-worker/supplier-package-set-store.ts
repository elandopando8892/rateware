import {
  type SqlPort,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  canonicalPackageSetJson,
  type SupplierPackageSetInput,
  supplierPackageSetPlan,
  type SupplierPackageSetPublisher,
  type SupplierPackageSetReceipt,
} from "./supplier-package-set.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Internal worker adapter. The caller must resolve mappings from the reviewed
 * snapshot; neither an HTTP body nor LLM output is a trusted reservation input.
 * No Storage, signatures, job claiming or dispatch is performed here.
 */
export async function createSupplierPackageSetStore(
  sql: SqlPort,
  input: SupplierPackageSetInput,
  job: { jobId: string; leaseToken: string },
): Promise<
  SupplierPackageSetPublisher & {
    reserve(): Promise<SupplierPackageSetReceipt | null>;
  }
> {
  if (!UUID.test(job.jobId) || !UUID.test(job.leaseToken)) {
    throw new Error("INVALID_INPUT");
  }
  const plan = await supplierPackageSetPlan(input);
  const {
    organizationId: org,
    caseId,
    setId,
    snapshotId,
    snapshotSha256,
    version,
  } = input;
  const { jobId, leaseToken } = job;
  const transact = <T>(action: (tx: SqlPort) => Promise<T>) =>
    withWorkerTransaction(sql, async (tx) => {
      await tx`select set_config('osp.organization_id', ${org}, true)`;
      return await action(tx);
    });
  const lockContext = async (tx: SqlPort) => {
    await tx`select osp_private.lock_supplier_package_set_context(${org}::uuid, ${caseId}::uuid, ${snapshotId}::uuid, ${snapshotSha256}::text, ${jobId}::uuid, ${leaseToken}::uuid)`;
  };
  const assertSources = async (tx: SqlPort) => {
    const rows = await tx`
      select count(*)::integer as matched
      from jsonb_array_elements(${
      JSON.stringify(plan.members)
    }::text::jsonb) item(member)
      join osp_private.case_package_input_snapshots snapshot
        on snapshot.organization_id = ${org}::uuid and snapshot.case_id = ${caseId}::uuid
        and snapshot.id = ${snapshotId}::uuid and snapshot.canonical_sha256 = ${snapshotSha256}
      join osp_private.document_versions source
        on source.organization_id = snapshot.organization_id
        and source.id::text = member->>'sourceVersionId'
        and source.id = any(snapshot.document_version_ids)
        and source.source_sha256 = member->>'sourceSha256'
        and source.document_type = 'supplier_requirement' and source.status = 'approved'
        and source.content_type = case member->>'kind'
          when 'pdf' then 'application/pdf'
          when 'docx' then ${DOCX}
          when 'xlsx' then coalesce(nullif(member->>'sourceContentType',''), ${XLSX}) end
      where not exists (
        select 1 from jsonb_array_elements_text(member->'approvedMappingDecisionIds') decision(id)
        where not (decision.id::uuid = any(snapshot.review_decision_ids))
      )`;
    if (Number(rows[0]?.matched) !== plan.members.length) {
      throw new Error("SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT");
    }
  };
  const assertReceipt = async (receipt: SupplierPackageSetReceipt) => {
    if (
      receipt.schemaVersion !== 1 || receipt.organizationId !== org ||
      receipt.caseId !== caseId || receipt.setId !== setId ||
      receipt.snapshotId !== snapshotId ||
      receipt.snapshotSha256 !== snapshotSha256 ||
      receipt.version !== version || receipt.planSha256 !== plan.sha256 ||
      !Array.isArray(receipt.members) ||
      receipt.members.length !== plan.members.length
    ) throw new Error("SUPPLIER_PACKAGE_SET_RECEIPT_INVALID");
    for (let index = 0; index < plan.members.length; index++) {
      const expected = plan.members[index];
      const member = receipt.members[index];
      const artifact = member.artifact;
      const contentType = expected.kind === "pdf"
        ? "application/pdf"
        : expected.kind === "docx"
        ? DOCX
        : expected.sourceContentType === XLSM
        ? XLSM
        : XLSX;
      if (
        member.requirementId !== expected.requirementId ||
        member.objectId !==
          `${org}:${caseId}:${setId}:${expected.sourceVersionId}` ||
        artifact.sourceVersionId !== expected.sourceVersionId ||
        artifact.sourceSha256 !== expected.sourceSha256 ||
        artifact.packageSnapshotId !== snapshotId ||
        artifact.packageSnapshotSha256 !== snapshotSha256 ||
        artifact.version !== version || artifact.contentType !== contentType ||
        !SHA.test(artifact.outputSha256) || !Array.isArray(artifact.mappings) ||
        canonicalPackageSetJson(
            [
              ...new Set(
                artifact.mappings.map((m: { mappingDecisionId: string }) =>
                  m.mappingDecisionId
                ),
              ),
            ]
              .sort(),
          ) !==
          canonicalPackageSetJson(expected.approvedMappingDecisionIds)
      ) throw new Error("SUPPLIER_PACKAGE_SET_RECEIPT_INVALID");
    }
    const { manifestSha256, ...manifest } = receipt;
    if (
      manifestSha256 !==
        await sha256Hex(
          new TextEncoder().encode(canonicalPackageSetJson(manifest)),
        )
    ) {
      throw new Error("SUPPLIER_PACKAGE_SET_RECEIPT_INVALID");
    }
  };
  return Object.freeze({
    reserve: () =>
      transact(async (tx) => {
        await lockContext(tx);
        await assertSources(tx);
        const existing =
          await tx`select id, job_id, version, plan_sha256, status, receipt_json from osp_private.supplier_package_sets where organization_id = ${org}::uuid and input_snapshot_id = ${snapshotId}::uuid for update`;
        if (existing.length) {
          const row = existing[0];
          if (
            row.id !== setId || row.job_id !== jobId ||
            Number(row.version) !== version || row.plan_sha256 !== plan.sha256
          ) {
            throw new Error("SUPPLIER_PACKAGE_SET_PLAN_CONFLICT");
          }
          if (row.status === "prepared") return null;
          if (row.status === "current" || row.status === "superseded") {
            const receipt = row.receipt_json as SupplierPackageSetReceipt;
            await assertReceipt(receipt);
            return receipt;
          }
          throw new Error("SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED");
        }
        const versions =
          await tx`select coalesce(max(version),0)::integer + 1 as next_version from osp_private.supplier_package_sets where organization_id = ${org}::uuid and case_id = ${caseId}::uuid`;
        if (Number(versions[0]?.next_version) !== version) {
          throw new Error("SUPPLIER_PACKAGE_SET_VERSION_CONFLICT");
        }
        await tx`insert into osp_private.supplier_package_sets (id, organization_id, case_id, input_snapshot_id, input_snapshot_sha256, job_id, version, plan_sha256, source_plan_json, status) values (${setId}::uuid, ${org}::uuid, ${caseId}::uuid, ${snapshotId}::uuid, ${snapshotSha256}, ${jobId}::uuid, ${version}, ${plan.sha256}, ${
          JSON.stringify(plan.members)
        }::text::jsonb, 'prepared')`;
        return null;
      }),
    publish: async (receipt: SupplierPackageSetReceipt) => {
      await assertReceipt(receipt);
      await transact(async (tx) => {
        await lockContext(tx);
        await assertSources(tx);
        const rows =
          await tx`select plan_sha256, status, receipt_json from osp_private.supplier_package_sets where organization_id = ${org}::uuid and case_id = ${caseId}::uuid and id = ${setId}::uuid and job_id = ${jobId}::uuid for update`;
        if (rows.length !== 1 || rows[0].plan_sha256 !== plan.sha256) {
          throw new Error("SUPPLIER_PACKAGE_SET_PLAN_CONFLICT");
        }
        if (
          rows[0].status === "current" &&
          canonicalPackageSetJson(rows[0].receipt_json) ===
            canonicalPackageSetJson(receipt)
        ) return;
        if (rows[0].status !== "prepared") {
          throw new Error("SUPPLIER_PACKAGE_SET_STATE_CONFLICT");
        }
        // Both statements live in the same transaction. Any failed insert/update
        // rolls back retirement, leaving the previous set fully current.
        await tx`update osp_private.supplier_package_sets set status = 'superseded', updated_at = statement_timestamp() where organization_id = ${org}::uuid and case_id = ${caseId}::uuid and status = 'current'`;
        const changed =
          await tx`update osp_private.supplier_package_sets set status = 'current', receipt_json = ${
            JSON.stringify(receipt)
          }::text::jsonb, manifest_sha256 = ${receipt.manifestSha256}, updated_at = statement_timestamp() where organization_id = ${org}::uuid and id = ${setId}::uuid and status = 'prepared' returning id`;
        if (changed.length !== 1) {
          throw new Error("SUPPLIER_PACKAGE_SET_STATE_CONFLICT");
        }
      });
    },
    load: (requestedSetId: string) =>
      transact(async (tx) => {
        if (requestedSetId !== setId) {
          throw new Error("SUPPLIER_PACKAGE_SET_PLAN_CONFLICT");
        }
        const rows =
          await tx`select receipt_json from osp_private.supplier_package_sets where organization_id = ${org}::uuid and case_id = ${caseId}::uuid and id = ${setId}::uuid and job_id = ${jobId}::uuid and status in ('current','superseded')`;
        if (!rows.length) return null;
        const receipt = rows[0].receipt_json as SupplierPackageSetReceipt;
        await assertReceipt(receipt);
        return receipt;
      }),
    hold: (requestedSetId: string) =>
      transact(async (tx) => {
        if (requestedSetId !== setId) {
          throw new Error("SUPPLIER_PACKAGE_SET_PLAN_CONFLICT");
        }
        await tx`update osp_private.supplier_package_sets set status = 'manual_reconciliation_required', updated_at = statement_timestamp() where organization_id = ${org}::uuid and case_id = ${caseId}::uuid and id = ${setId}::uuid and job_id = ${jobId}::uuid and status = 'prepared'`;
      }),
  });
}
