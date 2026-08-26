import postgres from "postgres";

import {
  type ReleaseControlStore,
  type ReleaseControlTransition,
  type ReleaseEvidenceStore,
} from "./handler.ts";
import {
  createReleaseControlRuntime,
  type ReleaseControlStores,
} from "./composition.ts";

function createStores(databaseUrl: string): ReleaseControlStores {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 20,
    onnotice: () => undefined,
    ssl: "require",
  });

  const store: ReleaseControlStore = {
    async get() {
      const rows = await sql<{
        release_id: string | null;
        release_mode:
          | "disabled"
          | "shadow"
          | "internal_send"
          | "bounded_cohort";
        version: number;
      }[]>`
      select release_id, release_mode, version
      from osp_private.production_controls
      where id = 'singleton'
    `;
      if (rows.length !== 1) throw new Error("RELEASE_CONTROL_UNAVAILABLE");
      return {
        mode: rows[0].release_mode,
        releaseId: rows[0].release_id,
        version: rows[0].version,
      };
    },
    async set(input: ReleaseControlTransition) {
      const releaseId = input.releaseId;
      const mode = input.mode;
      const expectedVersion = input.expectedVersion;
      const approvalId = input.approvalId;
      const manifestSha256 = input.manifestSha256;
      const candidateCommit = input.candidateCommit;
      const approverRole = input.approverRole;
      const approverSubject = input.approverSubject;
      const keyId = input.keyId;
      const cohortPolicySha256 = input.cohortPolicySha256;
      const operationId = input.operationId;
      const evidenceReceiptIds = input.evidenceReceiptIds;
      const cohortSize = input.cohortSize ?? null;
      const maximumCohortSize = input.mode === "bounded_cohort"
        ? input.maximumCohortSize
        : null;
      const cohortMembers = input.mode === "bounded_cohort"
        ? sql.json(input.cohortMembers)
        : null;
      const rows = await sql<{
        receipt_id: string;
        release_id: string;
        release_mode:
          | "disabled"
          | "shadow"
          | "internal_send"
          | "bounded_cohort";
        control_version: number;
      }[]>`
      select * from osp_private.set_release_mode(
        ${releaseId},
        ${mode},
        ${expectedVersion},
        ${approvalId},
        ${manifestSha256},
        ${candidateCommit},
        ${approverRole},
        ${approverSubject},
        ${keyId},
        ${cohortPolicySha256},
        ${operationId},
        ${evidenceReceiptIds}::jsonb,
        ${cohortSize},
        ${maximumCohortSize},
        ${cohortMembers}
      )
    `;
      if (rows.length !== 1) throw new Error("RELEASE_CONTROL_UNAVAILABLE");
      return {
        mode: rows[0].release_mode,
        receiptId: rows[0].receipt_id,
        releaseId: rows[0].release_id,
        version: rows[0].control_version,
      };
    },
  };

  const evidenceStore: ReleaseEvidenceStore = {
    async consume(input) {
      try {
        const environment = "production";
        const releaseId = input.releaseId;
        const step = input.step;
        const operationId = input.operationId;
        const candidateCommit = input.candidateCommit;
        const manifestSha256 = input.manifestSha256;
        const validatorSha256 = input.validatorSha256;
        const commandSha256 = input.commandSha256;
        const outputSha256 = input.outputSha256;
        const nonce = input.nonce;
        const workflowRef = input.workflowRef;
        const runId = input.runId;
        const requestIssuedAt = input.requestIssuedAt;
        const requestExpiresAt = input.requestExpiresAt;
        const requestingApprovalId = input.requestingApprovalId;
        const requestingApprovalKeyFingerprint = input.requestingApprovalKeyFingerprint;
        const requestingApprovalKeyId = input.requestingApprovalKeyId;
        const requestingApprovalRole = input.requestingApprovalRole;
        const issuedAt = input.issuedAt;
        const expiresAt = input.expiresAt;
        const attestationSha256 = input.attestationSha256;
        const runnerKeyId = input.runnerKeyId;
        const expectedVersion = input.expectedVersion;
        const rows = await sql<{
          receipt_id: string;
          release_id: string;
          step: string;
          operation_id: string;
          control_version: number;
        }[]>`
        select * from osp_private.consume_release_evidence(
          ${environment}, ${releaseId}, ${step}, ${operationId},
          ${candidateCommit}, ${manifestSha256}, ${validatorSha256},
          ${commandSha256}, ${outputSha256}, ${nonce}, ${workflowRef},
          ${runId}, ${requestIssuedAt}, ${requestExpiresAt},
          ${requestingApprovalId}, ${requestingApprovalRole},
          ${requestingApprovalKeyId}, ${requestingApprovalKeyFingerprint},
          ${issuedAt}, ${expiresAt}, ${attestationSha256},
          ${runnerKeyId}, ${expectedVersion}
        )
      `;
        if (rows.length !== 1) throw new Error("RELEASE_CONTROL_UNAVAILABLE");
        return {
          receiptId: rows[0].receipt_id,
          releaseId: rows[0].release_id,
          step: rows[0].step,
          operationId: rows[0].operation_id,
          controlVersion: rows[0].control_version,
        };
      } catch (caught) {
        const code = caught instanceof Error ? caught.message : "";
        if (
          [
            "RELEASE_EVIDENCE_REPLAY",
            "RELEASE_CONTROL_VERSION_CONFLICT",
            "RELEASE_EVIDENCE_INVALID",
          ].includes(code)
        ) throw caught;
        throw new Error("RELEASE_CONTROL_UNAVAILABLE");
      }
    },
  };

  return { store, evidenceStore };
}

const runtime = await createReleaseControlRuntime({
  env: Deno.env,
  createStores,
});

Deno.serve(runtime);
