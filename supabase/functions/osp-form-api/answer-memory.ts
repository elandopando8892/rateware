import type { SqlPort } from "../_shared/osp/database-context.ts";

export type AnswerMemorySummary = {
  pendingCount: number;
  unboundCount: number;
  staleCount: number;
  approvedForReuse: false;
};

/** Counts only; never exposes candidate values or treats a saved form as approval. */
export async function readAnswerMemorySummary(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
): Promise<AnswerMemorySummary> {
  const rows = await tx`
    select count(*)::integer as pending_count,
      count(*) filter (where candidate.legal_entity_id is null)::integer as unbound_count,
      count(*) filter (where candidate.source_instance_version <> instance.version
        or candidate.legal_entity_id is distinct from binding.legal_entity_id
        or candidate.binding_revision is distinct from binding.revision
        or candidate.answer_value is distinct from instance.values_json->candidate.field_key)::integer as stale_count
    from osp_private.case_answer_memory_candidates candidate
    join osp_private.case_form_instances instance on instance.organization_id = candidate.organization_id
      and instance.case_id = candidate.case_id and instance.id = candidate.source_instance_id
    left join osp_private.case_profile_bindings binding on binding.organization_id = candidate.organization_id
      and binding.case_id = candidate.case_id
    where candidate.organization_id = ${organizationId} and candidate.case_id = ${caseId}
  `;
  if (rows.length !== 1) throw new Error("PERSISTENCE_CORRUPT");
  const counts = ["pending_count", "unbound_count", "stale_count"].map((key) =>
    rows[0][key]
  );
  if (
    counts.some((value) =>
      typeof value !== "number" || !Number.isSafeInteger(value) || value < 0
    )
  ) throw new Error("PERSISTENCE_CORRUPT");
  return {
    pendingCount: counts[0] as number,
    unboundCount: counts[1] as number,
    staleCount: counts[2] as number,
    approvedForReuse: false,
  };
}
