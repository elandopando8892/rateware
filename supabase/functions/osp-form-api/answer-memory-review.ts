import type { SqlPort } from "../_shared/osp/database-context.ts";
import type {
  AnswerMemoryCandidate,
  AnswerMemoryReviewInput,
  AnswerMemoryReviewReceipt,
} from "../../../apps/osp/src/features/forms/answer-memory-contract.ts";

export type ReviewAnswerMemoryInput = AnswerMemoryReviewInput & {
  organizationId: string;
  subject: string;
  permission: "osp:operate" | "osp:superuser";
};

export async function readAnswerMemoryCandidates(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
): Promise<AnswerMemoryCandidate[]> {
  const rows = await tx`
    select candidate.id, candidate.source_label as label, candidate.answer_value as value,
      candidate.canonical_field_id as "canonicalFieldId", candidate.answer_sha256 as "answerSha256",
      candidate.source_instance_id as "sourceInstanceId", candidate.source_instance_version as "sourceVersion",
      candidate.legal_entity_id as "legalEntityId",
      (candidate.source_instance_version <> instance.version or candidate.answer_value is distinct from instance.values_json->candidate.field_key
        or candidate.legal_entity_id is distinct from binding.legal_entity_id or candidate.binding_revision is distinct from binding.revision) as stale,
      coalesce(review.decision, 'pending_review') as decision, review.reason
    from osp_private.case_answer_memory_candidates candidate
    join osp_private.case_form_instances instance on instance.organization_id=candidate.organization_id and instance.id=candidate.source_instance_id and instance.case_id=candidate.case_id
    left join osp_private.case_profile_bindings binding on binding.organization_id=candidate.organization_id and binding.case_id=candidate.case_id
    left join osp_private.case_answer_memory_reviews review on review.organization_id=candidate.organization_id and review.candidate_id=candidate.id
    where candidate.organization_id=${organizationId} and candidate.case_id=${caseId}
    order by candidate.captured_at desc, candidate.id limit 50
  `;
  return rows as AnswerMemoryCandidate[];
}

export async function reviewAnswerMemory(
  tx: SqlPort,
  input: ReviewAnswerMemoryInput,
): Promise<AnswerMemoryReviewReceipt> {
  await tx`select set_config('osp.actor_subject', ${input.subject}, true), set_config('osp.actor_permission', ${input.permission}, true)`;
  const rows =
    await tx`select osp_private.review_case_answer_memory(${input.organizationId}::uuid, ${input.caseId}::uuid, ${input.candidateId}::uuid, ${input.answerSha256}, ${input.decision}, ${input.reason}, ${input.subject}, ${input.idempotencyKey}) as receipt`;
  const receipt = rows[0]?.receipt as AnswerMemoryReviewReceipt | undefined;
  if (
    rows.length !== 1 || !receipt || typeof receipt.reviewId !== "string" ||
    !["accepted", "rejected"].includes(receipt.decision) ||
    typeof receipt.replayed !== "boolean" || receipt.approvedForReuse !== false
  ) throw new Error("PERSISTENCE_CORRUPT");
  return receipt;
}
