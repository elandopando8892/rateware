// Operator commands for requirement waivers.
//
// Recording a waiver is an override, so it is deliberately narrow: one requirement, one
// legal entity, a written justification, and an expiry the operator has to choose. The
// requirement's own row supplies the program and version, so a caller cannot widen the
// scope by mis-stating it.
//
// A waiver changes readiness. It does NOT change authorization: a release package still
// needs its approvals, and the requester still cannot approve their own package. An
// operator can accept a gap; they cannot thereby release the package alone.

import { validateWaiverRequest } from './provider-onboarding-requirement-waiver.mjs';
import { ClientError, conflict, notFound } from './http-error.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value:unknown,field:string){
  const result=String(value||'').trim();
  if(!UUID.test(result)) throw new ClientError(`${field} must be a valid UUID.`);
  return result;
}

export async function recordProviderOnboardingRequirementWaiver(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const legalEntityId=uuid(input.legal_entity_id,'legal_entity_id');
  const requirementId=uuid(input.requirement_id,'requirement_id');
  const actor=String(actorId||'').trim();
  if(!actor) throw new ClientError('actor_id is required.');

  // Scope comes from the requirement row, never from the caller. Letting a caller state
  // the program or version would let one waiver be aimed at a requirement set it was
  // never reviewed against.
  const requirement=await supabase.from('provider_onboarding_requirements')
    .select('id,requirement_code,program_code,requirement_set_version,is_required,active')
    .eq('organization_id',organizationId).eq('id',requirementId).maybeSingle();
  if(requirement.error) throw requirement.error;
  if(!requirement.data) throw notFound('Requirement was not found.');
  if(!requirement.data.active) throw new ClientError('Requirement is not active; there is nothing to waive.');

  const authorizedAt=new Date().toISOString();
  // validateWaiverRequest lives in a .mjs module that Node's tests import directly, so it
  // stays free of runtime imports and throws plain Errors. Everything it rejects is the
  // caller's input, so the classification happens here rather than there.
  let validated;
  try{
    validated=validateWaiverRequest({
      justification:input.justification,
      substitute_reference:input.substitute_reference,
      expires_at:input.expires_at,
      authorized_at:authorizedAt,
    });
  }catch(error){
    throw new ClientError((error as Error)?.message || 'The waiver request is invalid.');
  }

  const inserted=await supabase.from('provider_onboarding_requirement_waivers').insert({
    organization_id:organizationId,legal_entity_id:legalEntityId,
    requirement_id:requirementId,requirement_code:requirement.data.requirement_code,
    program_code:requirement.data.program_code,
    requirement_set_version:requirement.data.requirement_set_version,
    waiver_status:'active',
    justification:validated.justification,
    substitute_reference:validated.substitute_reference,
    authorized_by_actor_id:actor,authorized_at:authorizedAt,
    expires_at:validated.expires_at,
  }).select('id,requirement_code,expires_at').single();
  // The partial unique index allows one active waiver per requirement per entity, so a
  // duplicate is a conflict rather than a second override.
  if(inserted.error){
    if(String(inserted.error.code)==='23505'){
      throw conflict('An active waiver already exists for this requirement; revoke it first.');
    }
    throw inserted.error;
  }

  return {
    waiver_id:inserted.data.id,requirement_code:inserted.data.requirement_code,
    waiver_status:'active',expires_at:inserted.data.expires_at,
    // Readiness is not re-run here. The operator re-evaluates when they are ready, so
    // one evaluation can carry several decisions rather than one per click.
    readiness_reevaluation_required:true,
  };
}

export async function revokeProviderOnboardingRequirementWaiver(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const waiverId=uuid(input.waiver_id,'waiver_id');
  const actor=String(actorId||'').trim();
  if(!actor) throw new ClientError('actor_id is required.');
  const reason=String(input.revocation_reason||'').trim();
  if(reason.length<10) throw new ClientError('revocation_reason must explain why the override no longer stands.');
  if(reason.length>2000) throw new ClientError('revocation_reason is too long.');

  const now=new Date().toISOString();
  const revoked=await supabase.from('provider_onboarding_requirement_waivers').update({
    waiver_status:'revoked',revoked_at:now,revoked_by_actor_id:actor,revocation_reason:reason,
  }).eq('organization_id',organizationId).eq('id',waiverId).eq('waiver_status','active')
    .select('id,requirement_code').maybeSingle();
  if(revoked.error) throw revoked.error;
  if(!revoked.data) throw notFound('Active waiver was not found.');

  return {
    waiver_id:revoked.data.id,requirement_code:revoked.data.requirement_code,
    waiver_status:'revoked',
    // Any evaluation already carrying this waiver keeps its recorded status; it is a
    // historical record of a decision that was live at the time. New evaluations will
    // show the requirement unmet again.
    readiness_reevaluation_required:true,
  };
}
