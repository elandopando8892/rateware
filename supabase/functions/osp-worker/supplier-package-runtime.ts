import postgres from "postgres";
import type { SupabaseClient } from "supabase";

import {
  type SqlPort,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import type { SupplierArtifactReceipt } from "../_shared/osp/supplier-artifact-port.ts";
import type { XlsxArtifactMapping } from "../_shared/osp/xlsx-form-completer.ts";
import {
  type GeneratedSupplierPackageReceipt,
  generateSupplierPackageJob,
  type SupplierPackageJobInput,
  type SupplierPackageRecordStore,
} from "./supplier-package-job.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
type StorageClient = Pick<SupabaseClient, "storage">;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;

type SourceRow = {
  snapshot_sha256: string;
  source_version_id: string;
  source_sha256: string;
  source_bucket_id: string;
  source_object_key: string;
  mapping_decision_id: string;
  mappings: unknown;
};

function validJob(input: SupplierPackageJobInput): void {
  if (
    !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !UUID.test(input.snapshotId) || !UUID.test(input.jobId) ||
    !UUID.test(input.leaseToken)
  ) throw new Error("INVALID_INPUT");
}

function receipt(value: unknown): GeneratedSupplierPackageReceipt {
  const row = value as Record<string, unknown>;
  const artifact = row?.artifact as SupplierArtifactReceipt;
  if (
    !row || !UUID.test(String(row.packageId)) ||
    typeof row.objectId !== "string" || !artifact ||
    !SHA.test(String(artifact.outputSha256))
  ) throw new Error("SUPPLIER_PACKAGE_RECEIPT_INVALID");
  return row as GeneratedSupplierPackageReceipt;
}

function mappings(value: unknown): XlsxArtifactMapping[] {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("SUPPLIER_PACKAGE_INPUT_INVALID");
  }
  return value as XlsxArtifactMapping[];
}

async function download(
  client: StorageClient,
  bucket: string,
  key: string,
): Promise<Uint8Array> {
  const result = await client.storage.from(bucket).download(key);
  if (result.error || !result.data) {
    throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
  }
  return new Uint8Array(await result.data.arrayBuffer());
}

export function createPostgresSupplierPackageRecordStore(options: {
  databaseUrl: string;
  storageClient: StorageClient;
  postgresFactory?: PostgresFactory;
}): SupplierPackageRecordStore {
  const factory = options.postgresFactory ??
    (postgres as unknown as PostgresFactory);
  const created = factory(options.databaseUrl, {
    ssl: "verify-full",
    fetch_types: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
    connection: {
      application_name: "osp-supplier-package",
      statement_timeout: "5000",
    },
  });
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;

  const store: SupplierPackageRecordStore = {
    async prepare(input: SupplierPackageJobInput) {
      validJob(input);
      const prepared = await withWorkerTransaction(sql, async (tx) => {
        await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
        const jobs =
          await tx`select id from osp_private.background_jobs where organization_id = ${input.organizationId} and id = ${input.jobId} and kind = 'generate_supplier_package' and lease_token = ${input.leaseToken} and leased_until >= clock_timestamp() and completed_at is null and opaque_payload = ${
            JSON.stringify({
              caseId: input.caseId,
              snapshotId: input.snapshotId,
            })
          }::text::jsonb for update`;
        if (jobs.length !== 1) throw new Error("LEASE_CONFLICT");
        const existing =
          await tx`select status, package_id, object_id, package_version, artifact_receipt_json from osp_private.supplier_package_generation_runs where organization_id = ${input.organizationId} and input_snapshot_id = ${input.snapshotId} for update`;
        if (existing.length === 1) {
          if (existing[0].status === "generated") {
            return {
              kind: "generated",
              receipt: receipt(existing[0].artifact_receipt_json),
            } as const;
          }
          if (existing[0].status === "failed") {
            return { kind: "failed" } as const;
          }
          if (existing[0].status === "manual_reconciliation_required") {
            return { kind: "unknown_write" } as const;
          }
        }

        const sources =
          await tx`select snapshot.canonical_sha256 as snapshot_sha256, version.id::text as source_version_id, version.source_sha256, version.bucket_id as source_bucket_id, version.opaque_object_key as source_object_key, mapping.review_decision_id::text as mapping_decision_id, jsonb_agg(jsonb_build_object('mappingDecisionId', mapping.review_decision_id::text, 'canonicalFieldId', field.definition_json->>'canonicalFieldId', 'sheet', evidence->>'sheet', 'cell', evidence->>'cellRange', 'value', instance.values_json->field.field_key) order by evidence->>'sheet', evidence->>'cellRange', field.field_key) as mappings from osp_private.case_package_input_snapshots snapshot join osp_private.customer_registration_cases case_record on case_record.organization_id = snapshot.organization_id and case_record.id = snapshot.case_id and case_record.state = 'operations_review' and case_record.aggregate_version = snapshot.case_version join osp_private.case_form_instances instance on instance.organization_id = snapshot.organization_id and instance.case_id = snapshot.case_id and instance.id = snapshot.form_instance_id and instance.version = snapshot.form_instance_version join osp_private.supplier_form_mappings mapping on mapping.organization_id = snapshot.organization_id and mapping.case_id = snapshot.case_id and mapping.template_version_id = snapshot.template_version_id and mapping.extraction_id = any(snapshot.extraction_ids) and mapping.status in ('accepted', 'corrected') and mapping.review_decision_id = any(snapshot.review_decision_ids) and exists (select 1 from jsonb_array_elements(snapshot.mapping_refs) item(ref) where ref->>'mappingId' = mapping.id::text and ref->>'mappingVersion' = mapping.version::text and ref->>'mappingSha256' = mapping.after_sha256 and ref->>'extractionId' = mapping.extraction_id::text and ref->>'reviewDecisionId' = mapping.review_decision_id::text) join osp_private.document_extractions extraction on extraction.organization_id = snapshot.organization_id and extraction.case_id = snapshot.case_id and extraction.id = mapping.extraction_id and extraction.status = 'reviewed' join osp_private.document_versions version on version.organization_id = snapshot.organization_id and version.id = extraction.source_version_id and version.id = any(snapshot.document_version_ids) and version.document_type = 'supplier_requirement' and version.status = 'approved' and version.content_type = ${XLSX} join osp_private.extraction_fields extracted on extracted.organization_id = snapshot.organization_id and extracted.extraction_id = extraction.id join osp_private.form_fields field on field.organization_id = snapshot.organization_id and field.template_version_id = snapshot.template_version_id and field.definition_json->>'canonicalFieldId' = extracted.field_key cross join lateral jsonb_array_elements(extracted.evidence_json) item(evidence) where snapshot.organization_id = ${input.organizationId} and snapshot.case_id = ${input.caseId} and snapshot.id = ${input.snapshotId} and evidence->>'kind' = 'xlsx_cell' and evidence->>'sourceVersionId' = version.id::text and evidence->>'cellRange' ~ '^[A-Z]{1,3}[1-9][0-9]*$' and jsonb_typeof(instance.values_json->field.field_key) in ('string', 'number', 'boolean') and exists (select 1 from jsonb_array_elements(snapshot.field_evidence_refs) item(ref) where ref->>'fieldId' = extracted.id::text and ref->>'extractionId' = extracted.extraction_id::text and ref->>'kind' = evidence->>'kind' and ref->>'sourceVersionId' = evidence->>'sourceVersionId' and ref->>'rawEvidenceHash' = evidence->>'rawEvidenceHash') group by snapshot.canonical_sha256, version.id, version.source_sha256, version.bucket_id, version.opaque_object_key, mapping.review_decision_id` as unknown as SourceRow[];
        if (sources.length !== 1 || !SHA.test(sources[0].snapshot_sha256)) {
          throw new Error("SUPPLIER_PACKAGE_INPUT_INVALID");
        }
        const source = sources[0];
        const packageId = existing[0]?.package_id ?? crypto.randomUUID();
        const packageVersion = Number(
          existing[0]?.package_version ??
            (await tx`select coalesce(max(version), 0) + 1 as version from osp_private.generated_packages where organization_id = ${input.organizationId} and case_id = ${input.caseId}`)[
              0
            ].version,
        );
        const objectId = existing[0]?.object_id ??
          `${input.organizationId}:${input.caseId}:${input.snapshotId}:supplier_completed:${packageVersion}`;
        if (existing.length === 0) {
          await tx`insert into osp_private.supplier_package_generation_runs (id, organization_id, case_id, input_snapshot_id, job_id, package_id, object_id, package_version, status) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${input.snapshotId}, ${input.jobId}, ${packageId}, ${objectId}, ${packageVersion}, 'prepared')`;
        }
        return {
          kind: "ready",
          packageId: String(packageId),
          objectId: String(objectId),
          packageVersion,
          source,
        } as const;
      });
      if (prepared.kind !== "ready") return prepared;
      const sourceBytes = await download(
        options.storageClient,
        prepared.source.source_bucket_id,
        prepared.source.source_object_key,
      );
      return {
        kind: "ready",
        packageId: prepared.packageId,
        objectId: prepared.objectId,
        input: {
          sourceVersionId: prepared.source.source_version_id,
          sourceBytes,
          sourceSha256: prepared.source.source_sha256,
          packageSnapshotId: input.snapshotId,
          packageSnapshotSha256: prepared.source.snapshot_sha256,
          approvedMappingDecisionIds: [prepared.source.mapping_decision_id],
          version: prepared.packageVersion,
          mappings: mappings(prepared.source.mappings),
        },
      } as const;
    },
    async recordGenerated(
      input: SupplierPackageJobInput & {
        receipt: GeneratedSupplierPackageReceipt;
      },
    ) {
      validJob(input);
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
        const runs =
          await tx`select package_id, object_id, package_version, status from osp_private.supplier_package_generation_runs where organization_id = ${input.organizationId} and input_snapshot_id = ${input.snapshotId} and job_id = ${input.jobId} for update`;
        if (
          runs.length !== 1 || runs[0].status !== "prepared" ||
          runs[0].package_id !== input.receipt.packageId ||
          runs[0].object_id !== input.receipt.objectId
        ) throw new Error("SUPPLIER_PACKAGE_STATE_CONFLICT");
        const prior =
          await tx`select id from osp_private.generated_packages where organization_id = ${input.organizationId} and case_id = ${input.caseId} and package_kind = 'supplier_completed' and status = 'current' for update`;
        if (prior.length > 1) {
          throw new Error("SUPPLIER_PACKAGE_STATE_CONFLICT");
        }
        if (prior.length === 1) {
          await tx`update osp_private.generated_packages set status = 'superseded' where organization_id = ${input.organizationId} and id = ${
            prior[0].id
          }`;
        }
        await tx`insert into osp_private.generated_packages (id, organization_id, case_id, input_snapshot_id, input_snapshot_sha256, object_id, output_sha256, version, package_kind, status, supersedes_package_id, artifact_receipt_json) values (${input.receipt.packageId}, ${input.organizationId}, ${input.caseId}, ${input.snapshotId}, ${input.receipt.artifact.packageSnapshotSha256}, ${input.receipt.objectId}, ${input.receipt.artifact.outputSha256}, ${
          Number(runs[0].package_version)
        }, 'supplier_completed', 'current', ${prior[0]?.id ?? null}, ${
          JSON.stringify(input.receipt.artifact)
        }::text::jsonb)`;
        await tx`update osp_private.supplier_package_generation_runs set status = 'generated', artifact_receipt_json = ${
          JSON.stringify(input.receipt)
        }::text::jsonb, last_error_code = null, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and input_snapshot_id = ${input.snapshotId}`;
      });
    },
    async recordFailed(
      input: SupplierPackageJobInput & { errorCode: string },
    ) {
      validJob(input);
      if (input.errorCode.endsWith("_TEMPORARY")) return;
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
        await tx`update osp_private.supplier_package_generation_runs set status = 'failed', last_error_code = ${input.errorCode}, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and input_snapshot_id = ${input.snapshotId} and status = 'prepared'`;
      });
    },
    async holdForManualReconciliation(input: SupplierPackageJobInput) {
      validJob(input);
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
        await tx`update osp_private.supplier_package_generation_runs set status = 'manual_reconciliation_required', updated_at = statement_timestamp() where organization_id = ${input.organizationId} and input_snapshot_id = ${input.snapshotId} and status = 'prepared'`;
      });
    },
  };
  return Object.freeze(store);
}

export function createSupplierPackageJobService(options: {
  databaseUrl: string;
  storageClient: StorageClient;
  postgresFactory?: PostgresFactory;
}) {
  const records = createPostgresSupplierPackageRecordStore(options);
  const objects = Object.freeze({
    writeExclusive: async (input: {
      organizationId: string;
      objectId: string;
      bytes: Uint8Array;
      contentType: typeof XLSX;
    }) => {
      const bucket = options.storageClient.storage.from(
        "osp-derived-documents",
      );
      const result = await bucket.upload(input.objectId, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });
      if (!result.error) return;
      const persisted = await bucket.download(input.objectId);
      if (!persisted.error && persisted.data) {
        const bytes = new Uint8Array(await persisted.data.arrayBuffer());
        if (await sha256Hex(bytes) === await sha256Hex(input.bytes)) return;
      }
      throw new Error("SUPPLIER_PACKAGE_WRITE_OUTCOME_UNKNOWN");
    },
  });
  return Object.freeze({
    generate: async (input: SupplierPackageJobInput) =>
      await generateSupplierPackageJob(input, { records, objects }),
  });
}
