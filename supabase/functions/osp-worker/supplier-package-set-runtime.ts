import type { SupabaseClient } from "supabase";
import {
  type SqlPort,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
import type { XlsxArtifactMapping } from "../_shared/osp/xlsx-form-completer.ts";
import type { PdfArtifactMapping } from "../_shared/osp/pdf-form-completer.ts";
import type { DocxArtifactMapping } from "../_shared/osp/docx-form-completer.ts";
import type {
  SupplierPackageJobInput,
  SupplierPackageObjectStore,
} from "./supplier-package-job.ts";
import {
  generateSupplierPackageSet,
  type SupplierPackageSetInput,
} from "./supplier-package-set.ts";
import { createSupplierPackageSetStore } from "./supplier-package-set-store.ts";
import { loadReviewedPackageSetSources } from "./supplier-package-set-sources.ts";
import { resolveReviewedSpreadsheetTargets } from "./reviewed-spreadsheet-targets.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12";

/** Uses the existing claimed job and immutable Storage writer. Migration absence
 * retains the legacy runtime. One or many reviewed originals use this same set
 * contract; a set failure never falls back to publishing only one original.
 */
export async function tryGenerateSupplierPackageSet(
  input: SupplierPackageJobInput,
  deps: {
    sql: SqlPort;
    storageClient: Pick<SupabaseClient, "storage">;
    objects: SupplierPackageObjectStore;
  },
) {
  if (
    ![
      input.organizationId,
      input.caseId,
      input.snapshotId,
      input.jobId,
      input.leaseToken,
    ].every((id) => UUID.test(id))
  ) throw new Error("INVALID_INPUT");
  const prepared = await withWorkerTransaction(deps.sql, async (tx) => {
    await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
    const available =
      await tx`select to_regclass('osp_private.supplier_package_sets') is not null as package_sets_available`;
    if (available[0]?.package_sets_available !== true) return null;
    // Legacy receipts/reservations remain authoritative, including prior failures.
    const legacy =
      await tx`select id from osp_private.supplier_package_generation_runs where organization_id = ${input.organizationId}::uuid and input_snapshot_id = ${input.snapshotId}::uuid`;
    if (legacy.length) return null;
    const snapshots =
      await tx`select canonical_sha256 from osp_private.case_package_input_snapshots where organization_id = ${input.organizationId}::uuid and case_id = ${input.caseId}::uuid and id = ${input.snapshotId}::uuid`;
    const sha = String(snapshots[0]?.canonical_sha256);
    if (snapshots.length !== 1 || !SHA.test(sha)) {
      throw new Error("SUPPLIER_PACKAGE_SET_STALE_SNAPSHOT");
    }
    await tx`select osp_private.lock_supplier_package_set_context(${input.organizationId}::uuid, ${input.caseId}::uuid, ${input.snapshotId}::uuid, ${sha}::text, ${input.jobId}::uuid, ${input.leaseToken}::uuid)`;
    const sources = await loadReviewedPackageSetSources(tx, input);
    if (sources.length < 1) return null;
    if (
      sources.length > 20 ||
      sources.some((source) => source.snapshot_sha256 !== sha)
    ) throw new Error("SUPPLIER_PACKAGE_SET_INPUT_INVALID");
    const existing =
      await tx`select id, version, status from osp_private.supplier_package_sets where organization_id = ${input.organizationId}::uuid and input_snapshot_id = ${input.snapshotId}::uuid`;
    if (existing[0]?.status === "manual_reconciliation_required") {
      throw new Error("SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED");
    }
    const version = existing.length ? Number(existing[0].version) : Number(
      (await tx`select coalesce(max(version),0)::integer + 1 as next_version from osp_private.supplier_package_sets where organization_id = ${input.organizationId}::uuid and case_id = ${input.caseId}::uuid`)[
        0
      ]?.next_version,
    );
    const requiredTables =
      await tx`select field.field_key from osp_private.case_package_input_snapshots snapshot join osp_private.form_fields field on field.organization_id = snapshot.organization_id and field.template_version_id = snapshot.template_version_id where snapshot.organization_id = ${input.organizationId}::uuid and snapshot.case_id = ${input.caseId}::uuid and snapshot.id = ${input.snapshotId}::uuid and field.definition_json->>'required' = 'true' and field.definition_json->'definition'->>'kind' = 'repeating_table'`;
    return {
      sources,
      version,
      sha,
      setId: String(existing[0]?.id ?? input.snapshotId),
      requiredKeys: requiredTables.map((row) => String(row.field_key)),
    };
  });
  if (!prepared) return null;
  const members: SupplierPackageSetInput["members"][number][] = [];
  let bytesRead = 0;
  for (const source of prepared.sources) {
    const downloaded = await deps.storageClient.storage.from(
      source.source_bucket_id,
    ).download(source.source_object_key);
    if (downloaded.error || !downloaded.data) {
      throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
    }
    const sourceBytes = new Uint8Array(await downloaded.data.arrayBuffer());
    bytesRead += sourceBytes.byteLength;
    if (bytesRead > 50 * 1024 * 1024) {
      throw new Error("SUPPLIER_PACKAGE_SET_TOO_LARGE");
    }
    if (!Array.isArray(source.mappings) || !source.mappings.length) {
      throw new Error("SUPPLIER_PACKAGE_SET_INPUT_INVALID");
    }
    const context = {
      sourceBytes,
      sourceVersionId: source.source_version_id,
      sourceSha256: source.source_sha256,
      packageSnapshotId: input.snapshotId,
      packageSnapshotSha256: prepared.sha,
      approvedMappingDecisionIds: [source.mapping_decision_id],
      version: prepared.version,
    };
    if (source.content_type === XLSX || source.content_type === XLSM) {
      const reviewed = source.mappings.some((item) =>
        item && typeof item === "object" && "reviewedTarget" in item
      );
      if (!reviewed && prepared.requiredKeys.length) {
        throw new Error("ARTIFACT_TABLE_TARGETS_INCOMPLETE");
      }
      // Reviewed table targets belong to this original, not every workbook in
      // the request. Global business completeness remains a separate gate.
      const localKeys = prepared.requiredKeys.filter((key) =>
        (source.mappings as Record<string, unknown>[]).some((item) =>
          item.fieldKey === key
        )
      );
      const mappings = reviewed
        ? resolveReviewedSpreadsheetTargets(source.mappings, localKeys)
        : source.mappings as XlsxArtifactMapping[];
      members.push({
        requirementId: `file:${source.source_version_id}`,
        artifact: {
          ...context,
          kind: "xlsx",
          sourceContentType: source.content_type,
          mappings,
        },
      });
    } else {
      if (source.content_type === "application/pdf") {
        const mappings = source.mappings as Record<string, unknown>[];
        if (
          mappings.some((mapping) =>
            mapping.kind !== "acroform" && mapping.kind !== "overlay"
          )
        ) {
          throw new Error("ARTIFACT_ORIGINAL_COMPLETION_UNSUPPORTED");
        }
        members.push({
          requirementId: `file:${source.source_version_id}`,
          artifact: {
            ...context,
            kind: "pdf",
            flatten: false,
            mappings: mappings as PdfArtifactMapping[],
          },
        });
      } else if (
        source.content_type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const mappings = source.mappings as Record<string, unknown>[];
        if (mappings.some((mapping) => mapping.kind !== "content_control")) {
          throw new Error("ARTIFACT_ORIGINAL_COMPLETION_UNSUPPORTED");
        }
        members.push({
          requirementId: `file:${source.source_version_id}`,
          artifact: {
            ...context,
            kind: "docx",
            mappings: mappings as DocxArtifactMapping[],
          },
        });
      } else throw new Error("SUPPLIER_PACKAGE_SET_INPUT_INVALID");
    }
  }
  const setInput: SupplierPackageSetInput = {
    organizationId: input.organizationId,
    caseId: input.caseId,
    setId: prepared.setId,
    snapshotId: input.snapshotId,
    snapshotSha256: prepared.sha,
    version: prepared.version,
    members,
  };
  const publisher = await createSupplierPackageSetStore(deps.sql, setInput, {
    jobId: input.jobId,
    leaseToken: input.leaseToken,
  });
  const existing = await publisher.reserve();
  return existing ??
    await generateSupplierPackageSet(setInput, {
      objects: deps.objects,
      publisher,
    });
}
