import postgres from "postgres";

import {
  type SqlPort,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
import type { SignatureApplyReceipt } from "../_shared/osp/signature-port.ts";
import type {
  SignatureJobInput,
  SignatureJobPreparation,
  SignatureJobRecordStore,
} from "./signature-job.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_/-]{1,512}$/;

function invalid(): never {
  throw new Error("SIGNATURE_RECORD_INVALID");
}

export function createPostgresSignatureJobStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): SignatureJobRecordStore {
  const created =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      options.databaseUrl,
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-signature-worker",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    prepare: async (
      input: SignatureJobInput,
    ): Promise<SignatureJobPreparation> =>
      await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.prepare_signature_application(${input.organizationId}, ${input.approvalId}, ${input.jobId}, ${input.leaseToken})`;
        if (
          rows.length !== 1 || !UUID.test(input.organizationId) ||
          !UUID.test(input.approvalId)
        ) invalid();
        const row = rows[0];
        if (row.preparation === "unknown_write") {
          return { kind: "unknown_write" };
        }
        if (row.preparation === "failed") {
          return { kind: "failed" };
        }
        if (
          typeof row.input_sha256 !== "string" || !SHA.test(row.input_sha256) ||
          typeof row.input_object_id !== "string" ||
          !OPAQUE.test(row.input_object_id)
        ) invalid();
        if (row.preparation === "applied") {
          if (
            typeof row.output_sha256 !== "string" ||
            !SHA.test(row.output_sha256) ||
            typeof row.output_object_id !== "string" ||
            !OPAQUE.test(row.output_object_id)
          ) invalid();
          return {
            kind: "applied",
            receipt: {
              inputSha256: row.input_sha256,
              outputSha256: row.output_sha256,
              outputObjectId: row.output_object_id,
            },
          };
        }
        const version = Number(row.position_version);
        if (
          row.preparation !== "ready" || typeof row.case_id !== "string" ||
          !UUID.test(row.case_id) || !Number.isSafeInteger(version) ||
          version < 1
        ) invalid();
        return {
          kind: "ready",
          request: {
            organizationId: input.organizationId,
            caseId: row.case_id,
            approvalId: input.approvalId,
            jobId: input.jobId,
            leaseToken: input.leaseToken,
            inputObjectId: row.input_object_id,
            expectedInputSha256: row.input_sha256,
            signaturePositionVersion: version,
          },
        };
      }),
    recordApplied: async (
      input: {
        organizationId: string;
        approvalId: string;
        jobId: string;
        leaseToken: string;
        receipt: SignatureApplyReceipt;
      },
    ) =>
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select osp_private.complete_signature_application(${input.organizationId}, ${input.approvalId}, ${input.jobId}, ${input.leaseToken}, ${input.receipt.inputSha256}, ${input.receipt.outputObjectId}, ${input.receipt.outputSha256})`;
      }),
    recordFailed: async (
      input: SignatureJobInput & { errorCode: string },
    ) =>
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select osp_private.fail_signature_application(${input.organizationId}, ${input.approvalId}, ${input.jobId}, ${input.leaseToken}, ${input.errorCode})`;
      }),
    holdForManualReconciliation: async (
      input: SignatureJobInput,
    ) =>
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select osp_private.hold_signature_application(${input.organizationId}, ${input.approvalId}, ${input.jobId}, ${input.leaseToken})`;
      }),
  });
}
