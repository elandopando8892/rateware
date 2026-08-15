export const PROVIDER_AGENT_APPROVAL_MODES = Object.freeze([
  'auto', 'human', 'finance', 'legal', 'executive', 'forbidden',
]);

export const PROVIDER_AGENT_ACTION_POLICY = Object.freeze({
  get_provider_context: 'auto',
  classify_intent: 'auto',
  extract_requirements: 'auto',
  propose_provider_match: 'auto',
  classify_document: 'auto',
  extract_document_fields: 'auto',
  draft_reply: 'auto',
  prepare_form: 'auto',
  summarize_status: 'auto',
  create_service_case: 'auto',
  add_case_task: 'auto',
  link_thread_to_case: 'auto',
  register_document_metadata: 'auto',
  link_document_to_requirement: 'auto',
  schedule_followup: 'auto',
  propose_requirement_state: 'auto',
  set_requirement_passed: 'human',
  send_standard_reply: 'human',
  share_tier_a_document: 'human',
  submit_credit_application: 'human',
  disclose_bank_reference: 'finance',
  disclose_bank_account: 'finance',
  change_bank_instructions: 'finance',
  apply_authorized_signature: 'executive',
  accept_contract_terms: 'legal',
  accept_indemnity: 'legal',
  authorize_ach_debit: 'executive',
  personal_guarantee: 'forbidden',
  ucc_filing: 'forbidden',
  merge_provider: 'forbidden',
  create_provider_from_ambiguous_match: 'forbidden',
  change_provider_legal_entity: 'forbidden',
  force_provider_activation: 'forbidden',
});

const SENSITIVITY_RANK = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
  highly_restricted: 4,
});

export function getProviderAgentApprovalMode(actionCode) {
  const code = String(actionCode ?? '').trim().toLowerCase();
  return PROVIDER_AGENT_ACTION_POLICY[code] ?? 'forbidden';
}

export function evaluateProviderAgentAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Agent action evaluation requires an object.');
  }

  const actionCode = String(input.actionCode ?? '').trim().toLowerCase();
  const baseMode = getProviderAgentApprovalMode(actionCode);
  const sensitivity = String(input.sensitivity ?? 'internal').trim().toLowerCase();
  const externalSideEffect = Boolean(input.externalSideEffect);
  const providerResolved = input.providerResolved !== false;
  const legalEntityResolved = input.legalEntityResolved !== false;

  if (!(sensitivity in SENSITIVITY_RANK)) {
    throw new RangeError(`Unsupported sensitivity: ${sensitivity}`);
  }

  if (baseMode === 'forbidden') {
    return Object.freeze({ decision: 'forbidden', approvalMode: 'forbidden', reason: 'action_policy' });
  }

  if (!legalEntityResolved) {
    return Object.freeze({ decision: 'blocked', approvalMode: 'human', reason: 'legal_entity_unresolved' });
  }

  if (!providerResolved && !['classify_intent', 'propose_provider_match', 'draft_reply', 'summarize_status'].includes(actionCode)) {
    return Object.freeze({ decision: 'blocked', approvalMode: 'human', reason: 'provider_unresolved' });
  }

  let approvalMode = baseMode;

  if (SENSITIVITY_RANK[sensitivity] >= SENSITIVITY_RANK.restricted && approvalMode === 'auto') {
    approvalMode = 'human';
  }

  if (externalSideEffect && approvalMode === 'auto') {
    approvalMode = 'human';
  }

  return Object.freeze({
    decision: approvalMode === 'auto' ? 'allowed' : 'approval_required',
    approvalMode,
    reason: approvalMode === baseMode ? 'action_policy' : 'risk_escalation',
  });
}

export function validateProviderAgentProposal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Agent proposal must be an object.');
  }

  const actionCode = String(input.actionCode ?? '').trim().toLowerCase();
  const rationale = String(input.rationale ?? '').trim();
  const confidence = Number(input.confidence);

  if (!actionCode) throw new TypeError('Agent proposal action code is required.');
  if (!rationale) throw new TypeError('Agent proposal rationale is required.');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError('Agent proposal confidence must be between 0 and 1.');
  }

  const evaluation = evaluateProviderAgentAction({
    actionCode,
    sensitivity: input.sensitivity ?? 'internal',
    externalSideEffect: input.externalSideEffect,
    providerResolved: input.providerResolved,
    legalEntityResolved: input.legalEntityResolved,
  });

  return Object.freeze({
    actionCode,
    rationale,
    confidence,
    sensitivity: String(input.sensitivity ?? 'internal').trim().toLowerCase(),
    externalSideEffect: Boolean(input.externalSideEffect),
    ...evaluation,
  });
}
