import type { SqlPort } from "../_shared/osp/database-context.ts";
import {
  type AnswerMemoryEvidence,
  AnswerMemoryEvidenceOptionSchema,
} from "../../../apps/osp/src/features/forms/answer-memory-evidence-contract.ts";

/** Read-only preflight. It neither links evidence nor invokes document promotion. */
export async function readAnswerMemoryEvidence(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
  candidateId: string,
): Promise<AnswerMemoryEvidence> {
  const payload =
    await tx`select osp_private.load_answer_memory_evidence(${organizationId}::uuid, ${caseId}::uuid, ${candidateId}::uuid) as options`;
  const rows = payload[0]?.options;
  if (payload.length !== 1 || !Array.isArray(rows)) {
    throw new Error("PERSISTENCE_CORRUPT");
  }
  return {
    options: rows.map((row) => AnswerMemoryEvidenceOptionSchema.parse(row)),
    readOnly: true,
    externalEffects: false,
  };
}
