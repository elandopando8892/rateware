// Sprint 1: the agent's intake step, composed and reachable.
//
// Called from provider-gmail-sync.ts for every newly-inserted inbound message. It
// resolves the thread to a provider, classifies the request, resolves the XBF legal
// entity, and records one agent run carrying the audit fields §17 requires.
//
// It proposes. It does not decide: an ambiguous provider or an ambiguous entity
// produces a review task, never a selection. Nothing here sends, approves or signs.
//
// The email body never leaves this function — the run records a context digest.

import { resolveXbfEntity } from './provider-agent-resolution.mjs';
import { resolveProviderThread } from './provider-agent-thread-resolution.ts';
import { classifyOnboardingRequest, resolveProviderKeys } from './provider-agent-classifier.mjs';
import { recordInboundEnvelope } from './provider-inbound-envelope.ts';

type IntakeMessage = {
  id?: string;
  threadId?: string;
  subject?: string | null;
  bodyText?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  replyToEmail?: string | null;
  attachments?: Array<{ filename?: string | null }>;
};

/** Reads provider keys from the environment. Absent keys degrade to the keyword tier. */
function providerKeys() {
  // Shared with the preview endpoint so both resolve the same secrets in the same
  // order; a key that works in one must work in the other.
  return resolveProviderKeys((globalThis as Record<string, any>).Deno?.env);
}

export async function runProviderOnboardingIntake(
  supabase: any,
  input: {
    organization_id: string;
    legal_entity_id: string;
    thread_id: string;
    mailbox_reference?: string | null;
    message: IntakeMessage;
    relationship_entity_kind?: string | null;
  },
) {
  const organizationId = String(input.organization_id);
  const legalEntityId = String(input.legal_entity_id);
  const threadId = String(input.thread_id);
  const message = input.message || {};
  const attachmentNames = (message.attachments || [])
    .map((item) => String(item?.filename || '').trim())
    .filter(Boolean);

  const run = await supabase.from('provider_agent_runs').insert({
    organization_id: organizationId,
    legal_entity_id: legalEntityId,
    thread_id: threadId,
    run_mode: 'intake',
    runtime_type: 'model_assisted',
    status: 'planning',
    initiated_by_actor_type: 'system',
    started_at: new Date().toISOString(),
  }).select('id').single();
  if (run.error) throw run.error;
  const runId = run.data.id;

  try {
    // 1. Which provider is this? Deterministic — confidence is inspectable.
    const match = await resolveProviderThread(supabase, {
      organization_id: organizationId,
      legal_entity_id: legalEntityId,
      thread_id: threadId,
      signals: {
        from_email: message.senderEmail,
        reply_to_email: message.replyToEmail,
        subject: message.subject,
        body_text: message.bodyText,
        sender_name: message.senderName,
      },
    });

    // 2. What are they asking for? The language problem — model-assisted.
    const classification = await classifyOnboardingRequest({
      subject: message.subject,
      body_text: message.bodyText,
      attachment_names: attachmentNames,
    }, providerKeys());

    // 3. Which XBF entity? Deterministic; ambiguity is never resolved silently.
    const entity = resolveXbfEntity({
      subject: message.subject,
      body_text: message.bodyText,
      attachment_names: attachmentNames,
      relationship_entity_kind: input.relationship_entity_kind ?? null,
    });

    // 4. Record the neutral inbox envelope — the durable, metadata-only record of
    // what arrived and where it routed. The envelope is idempotent on the Gmail
    // message id, so a replayed message adopts the existing one.
    //
    // A failed envelope write is captured rather than thrown: matching and
    // classification already succeeded, and discarding them because an audit row
    // was refused would lose more than it protects. The failure stays visible in
    // the run metadata, which is queryable.
    let envelope: Record<string, unknown> | null = null;
    let envelopeError: string | null = null;
    if (input.mailbox_reference && message.id) {
      try {
        envelope = await recordInboundEnvelope(supabase, {
          organization_id: organizationId,
          mailbox_reference: String(input.mailbox_reference),
          external_message_id: String(message.id),
          external_thread_id: message.threadId ?? null,
          entity,
          // Counts and codes only — the envelope table stores no message content.
          metadata: {
            request_type: classification.request_type,
            attachment_count: attachmentNames.length,
            match_decision: match.decision,
          },
        });
      } catch (error) {
        envelopeError = String((error as Error)?.message || 'envelope_failed').slice(0, 200);
      }
    } else {
      envelopeError = 'envelope_identity_unavailable';
    }

    const completedAt = new Date().toISOString();
    const update = await supabase.from('provider_agent_runs').update({
      provider_relationship_id: match.decision === 'matched' ? match.provider_relationship_id : null,
      status: 'ready',
      completed_at: completedAt,
      updated_at: completedAt,
      // Metadata carries the audit trail and no message content: the digest stands
      // in for the prompt, per §17.
      metadata: {
        match_decision: match.decision,
        match_reason: match.reason,
        match_candidate_count: match.candidate_count,
        vendor_id: match.vendor_id ?? null,
        request_type: classification.request_type,
        request_confidence: classification.confidence,
        language: classification.language,
        requested_document_count: classification.requested_documents.length,
        forms_to_complete_count: classification.forms_to_complete.length,
        entity_kind: entity.entity_kind,
        entity_decision: entity.decision,
        entity_basis: entity.basis,
        requires_human_entity_selection: entity.requires_human_selection,
        engine: classification.engine,
        model: classification.model,
        prompt_version: classification.prompt_version,
        policy_version: classification.policy_version,
        context_digest: classification.context_digest,
        failed_tiers: classification.attempts.map((attempt: any) => attempt.engine),
        decision: 'proposed',
        envelope_id: envelope?.envelope_id ?? null,
        envelope_status: envelope?.envelope_status ?? null,
        envelope_created: envelope?.created ?? false,
        envelope_error: envelopeError,
      },
    }).eq('organization_id', organizationId).eq('id', runId);
    if (update.error) throw update.error;

    return {
      agent_run_id: runId,
      envelope_id: envelope?.envelope_id ?? null,
      envelope_status: envelope?.envelope_status ?? null,
      match_decision: match.decision,
      vendor_id: match.vendor_id ?? null,
      request_type: classification.request_type,
      confidence: classification.confidence,
      engine: classification.engine,
      entity_kind: entity.entity_kind,
      requires_human_entity_selection: entity.requires_human_selection,
      requires_human_provider_selection: match.decision !== 'matched',
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    // The message is bounded and carries no body text; provider errors are already
    // reduced to a status upstream.
    const failure = String((error as Error)?.message || 'intake_failed').slice(0, 500);
    await supabase.from('provider_agent_runs').update({
      status: 'failed',
      failure_code: 'intake_failed',
      failure_message: failure,
      completed_at: failedAt,
      updated_at: failedAt,
    }).eq('organization_id', organizationId).eq('id', runId);
    throw error;
  }
}
