-- Recognize stable document concepts even when a supplier appends freshness,
-- format or legal-entity qualifiers. Provider form names and process
-- instructions still fail closed before these mappings are evaluated.

create or replace function osp_private.request_knowledge_reuse_policy(
  p_knowledge_kind text,
  p_canonical_key text,
  p_display_label text,
  p_aliases_json jsonb,
  p_value_type text
)
returns table (
  reuse_eligibility text,
  eligibility_reason text,
  target_canonical_key text,
  target_display_label text,
  target_aliases_json jsonb
)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized_label text := lower(btrim(p_display_label));
  resolved_key text;
  resolved_label text;
  resolved_eligibility text := 'review_required';
  resolved_reason text := 'taxonomy_review_required';
  resolved_aliases jsonb;
begin
  if p_knowledge_kind not in ('field', 'document')
     or p_canonical_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
     or p_display_label is distinct from btrim(p_display_label)
     or char_length(p_display_label) not between 1 and 256
     or jsonb_typeof(p_aliases_json) <> 'array'
     or jsonb_array_length(p_aliases_json) not between 1 and 21
     or (p_knowledge_kind = 'field' and p_value_type not in ('text', 'number', 'date', 'boolean', 'table', 'signature', 'unknown'))
     or (p_knowledge_kind = 'document' and p_value_type is not null) then
    raise exception using errcode = '22023', message = 'REQUEST_KNOWLEDGE_POLICY_INPUT_INVALID';
  end if;

  if normalized_label ~ '(cww[- _]?qf[- _]?[0-9]+|formato[[:space:]]+[0-9]+|supplier[[:space:]]+(registration|setup)[[:space:]]+(form|application)|provider[[:space:]]+(form|template)|cuestionario|questionnaire|plantilla|template)'
     or normalized_label ~ '^(llenado|completar|complete and sign|fill out|submit|enviar|firmado|signed)[[:space:]]' then
    resolved_eligibility := 'case_specific';
    resolved_reason := 'provider_specific_requirement';
  elsif p_knowledge_kind = 'document' then
    case
      when normalized_label ~ '(^|[^a-z0-9])w[ -]?9([^a-z0-9]|$)|irs[[:space:]]+form[[:space:]]+w-9|tax[[:space:]]+form' then
        resolved_key := 'fiscal.w9'; resolved_label := 'IRS Form W-9';
      when normalized_label ~ 'car[aá]tula[[:space:]]+del[[:space:]]+banco|bank[[:space:]]+account[[:space:]]+(evidence|verification)|voided[[:space:]]+check' then
        resolved_key := 'banking.account_evidence'; resolved_label := 'Bank account evidence';
      when normalized_label ~ 'bank[[:space:]]+(reference|letter)|carta[[:space:]]+(bancaria|de[[:space:]]+referencia[[:space:]]+bancaria)' then
        resolved_key := 'banking.reference_letter'; resolved_label := 'Bank reference letter';
      when normalized_label ~ 'comprobante([[:space:]]+de)?[[:space:]]+domicilio|proof[[:space:]]+of[[:space:]]+address|address[[:space:]]+proof' then
        resolved_key := 'legal.proof_of_address'; resolved_label := 'Proof of address';
      when normalized_label ~ 'constancia([[:space:]]+de)?[[:space:]]+situaci[oó]n[[:space:]]+fiscal|tax[[:space:]]+status[[:space:]]+certificate' then
        resolved_key := 'fiscal.tax_status_certificate'; resolved_label := 'Tax status certificate';
      when normalized_label ~ 'acta[[:space:]]+constitutiva|articles[[:space:]]+of[[:space:]]+incorporation|certificate[[:space:]]+of[[:space:]]+formation' then
        resolved_key := 'legal.articles_of_incorporation'; resolved_label := 'Articles of incorporation';
      when normalized_label ~ 'ine([[:space:]]+del)?[[:space:]]+representante|identificaci[oó]n([[:space:]]+del)?[[:space:]]+representante[[:space:]]+legal|legal[[:space:]]+representative[[:space:]]+id' then
        resolved_key := 'identity.legal_representative'; resolved_label := 'Legal representative identification';
      when normalized_label ~ '(opini[oó]n[[:space:]]+(positiva|de[[:space:]]+cumplimiento).*(sat)?|sat[[:space:]]+positive[[:space:]]+opinion|tax[[:space:]]+compliance[[:space:]]+opinion)' then
        resolved_key := 'fiscal.sat_compliance_opinion'; resolved_label := 'SAT tax compliance opinion';
      when normalized_label ~ 'poder[[:space:]]+notarial|power[[:space:]]+of[[:space:]]+attorney' then
        resolved_key := 'legal.power_of_attorney'; resolved_label := 'Power of attorney';
      when normalized_label ~ 'broker[[:space:]]+authority|mc[[:space:]]+authority|operating[[:space:]]+authority' then
        resolved_key := 'operations.broker_authority'; resolved_label := 'Broker operating authority';
      when normalized_label ~ 'bond[[:space:]]+insurance|surety[[:space:]]+bond|broker[[:space:]]+bond' then
        resolved_key := 'insurance.surety_bond'; resolved_label := 'Surety bond';
      else null;
    end case;
    if resolved_key is not null then
      resolved_eligibility := 'eligible';
      resolved_reason := 'curated_common_concept';
    end if;
  elsif p_knowledge_kind = 'field'
        and p_canonical_key = 'trade.references'
        and normalized_label ~ '^((three|3)[[:space:]])?trade references$' then
    resolved_key := 'business.trade.references';
    resolved_label := 'Trade references';
    resolved_eligibility := 'eligible';
    resolved_reason := 'curated_common_concept';
  elsif p_canonical_key ~ '^(supplier|business|fiscal|banking|legal|identity|contact|billing|shipping|operations|finance|credit|tax)\.[a-z0-9_.-]+$'
        and char_length(p_canonical_key) <= 96
        and char_length(p_display_label) <= 128 then
    resolved_key := p_canonical_key;
    resolved_label := p_display_label;
    resolved_eligibility := 'eligible';
    resolved_reason := 'stable_canonical_field';
  end if;

  if resolved_key is not null then
    select coalesce(jsonb_agg(candidate.value order by candidate.first_ordinal), '[]'::jsonb)
    into resolved_aliases
    from (
      select deduplicated.value, min(deduplicated.ordinality) as first_ordinal
      from (
        select resolved_label as value, 0::bigint as ordinality
        union all
        select alias.value, alias.ordinality
        from jsonb_array_elements_text(p_aliases_json) with ordinality alias(value, ordinality)
      ) deduplicated
      where btrim(deduplicated.value) <> ''
      group by lower(btrim(deduplicated.value)), deduplicated.value
      order by min(deduplicated.ordinality)
      limit 21
    ) candidate;
  else
    resolved_aliases := p_aliases_json;
  end if;

  return query select resolved_eligibility, resolved_reason, resolved_key,
    resolved_label, resolved_aliases;
end;
$$;

revoke all on function osp_private.request_knowledge_reuse_policy(text, text, text, jsonb, text)
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant execute on function osp_private.request_knowledge_reuse_policy(text, text, text, jsonb, text)
to osp_workflow_api;

comment on function osp_private.request_knowledge_reuse_policy(text, text, text, jsonb, text) is
'Deterministically classifies reviewed request concepts after separating reusable base concepts from supplier qualifiers. Provider forms fail closed; no values or external effects.';
