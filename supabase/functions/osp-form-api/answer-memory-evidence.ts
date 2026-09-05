import type { SqlPort } from "../_shared/osp/database-context.ts";
import {
  type AnswerMemoryEvidence,
  type AnswerMemoryEvidenceLinkInput,
  AnswerMemoryEvidenceLinkInputSchema,
  type AnswerMemoryEvidenceLinkReceipt,
  AnswerMemoryEvidenceLinkResponseSchema,
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
    await tx`select osp_private.load_answer_memory_evidence_intents(${organizationId}::uuid, ${caseId}::uuid, ${candidateId}::uuid) as options`;
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

export type LinkAnswerMemoryEvidenceInput = AnswerMemoryEvidenceLinkInput & {
  organizationId: string;
  subject: string;
  permission: "osp:operate" | "osp:superuser";
};
export async function linkAnswerMemoryEvidence(
  tx: SqlPort,
  input: LinkAnswerMemoryEvidenceInput,
): Promise<AnswerMemoryEvidenceLinkReceipt> {
  const { organizationId, subject, permission, ...request } = input;
  const row = AnswerMemoryEvidenceLinkInputSchema.parse(request);
  await tx`select set_config('osp.actor_subject', ${subject}, true), set_config('osp.actor_permission', ${permission}, true)`;
  const result =
    await tx`select osp_private.link_answer_memory_evidence(${organizationId}::uuid,${row.caseId}::uuid,${row.candidateId}::uuid,
    ${row.reviewFieldId}::uuid,${row.factId}::uuid,${row.answerSha256},${row.expectationSha256},${row.action},${row.reason},${subject},${row.idempotencyKey}) as receipt`;
  const parsed = AnswerMemoryEvidenceLinkResponseSchema.safeParse({
    version: 1,
    data: result[0]?.receipt,
  });
  if (result.length !== 1 || !parsed.success) {
    throw new Error("PERSISTENCE_CORRUPT");
  }
  return parsed.data.data;
}
