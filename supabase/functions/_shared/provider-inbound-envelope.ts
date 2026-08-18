// The neutral inbox envelope, written by the agent intake.
//
// `provider_inbound_envelopes` was built by a parallel agent and applied straight
// to production on 2026-08-17. It is the durable, metadata-only record of an
// inbound message and where it routed. This module is the bridge: it takes the
// deterministic output of `resolveXbfEntity` and records it as the envelope's
// routing decision, instead of standing up a second inbound record beside it.
//
// Division of labour, so neither table grows into the other:
//   provider_inbound_envelopes — WHAT arrived and WHERE it routed (durable, one
//                                per message, unique on the Gmail message id).
//   provider_agent_runs        — HOW the agent decided (engine, model, prompt
//                                version, context digest, confidence).
//
// Every decision rule lives in `provider-inbound-envelope-plan.mjs` so it can be
// executed by a test. This file only reads, writes and handles the race.

import {
  planInboundEnvelope,
  normalizeMailbox,
  ROUTING_COUNTRY,
} from './provider-inbound-envelope-plan.mjs';

const UNIQUE_VIOLATION = '23505';

type EntityResolution = {
  entity_kind?: string | null;
  decision?: string | null;
  basis?: string | null;
  confidence?: number | null;
  requires_human_selection?: boolean | null;
};

async function findEntitiesForJurisdiction(
  supabase: any,
  organizationId: string,
  entityKind: string,
) {
  const countryCode = (ROUTING_COUNTRY as Record<string, string>)[entityKind];
  if (!countryCode) return [];
  const result = await supabase
    .from('legal_entities')
    .select('id, entity_code')
    .eq('organization_id', organizationId)
    .eq('country_code', countryCode)
    .limit(2);
  if (result.error) throw result.error;
  return result.data || [];
}

async function lookupEnvelope(
  supabase: any,
  organizationId: string,
  mailbox: string,
  externalMessageId: string,
) {
  return await supabase
    .from('provider_inbound_envelopes')
    .select('id, envelope_status, routing_decision')
    .eq('organization_id', organizationId)
    .eq('source_channel', 'email')
    .eq('mailbox_reference', mailbox)
    .eq('external_message_id', externalMessageId)
    .maybeSingle();
}

/**
 * Records the inbound envelope for one message, exactly once.
 *
 * Idempotent by the table's own unique key (organization, channel, mailbox,
 * external message id): a replayed Gmail message returns the existing envelope
 * untouched. Re-routing an envelope a human may already have reviewed would
 * rewrite a decision, so this never updates one it did not create.
 */
export async function recordInboundEnvelope(
  supabase: any,
  input: {
    organization_id: string;
    mailbox_reference: string;
    external_message_id: string;
    external_thread_id?: string | null;
    entity: EntityResolution;
    metadata?: Record<string, unknown>;
  },
) {
  const organizationId = String(input.organization_id);
  const mailbox = normalizeMailbox(input.mailbox_reference);
  const externalMessageId = String(input.external_message_id || '').trim();

  const existing = await lookupEnvelope(supabase, organizationId, mailbox, externalMessageId);
  if (existing.error) throw existing.error;
  if (existing.data) {
    return {
      envelope_id: existing.data.id as string,
      envelope_status: existing.data.envelope_status as string,
      routing_decision: existing.data.routing_decision as string | null,
      created: false,
    };
  }

  const entity = input.entity || {};
  const entityKind = String(entity.entity_kind || '');
  const entities = entity.decision === 'resolved'
    ? await findEntitiesForJurisdiction(supabase, organizationId, entityKind)
    : [];

  const { row, events } = planInboundEnvelope({
    organization_id: organizationId,
    mailbox_reference: mailbox,
    external_message_id: externalMessageId,
    external_thread_id: input.external_thread_id ?? null,
    entity,
    entities,
    metadata: input.metadata || {},
  });

  const inserted = await supabase
    .from('provider_inbound_envelopes')
    .insert(row)
    .select('id')
    .single();

  if (inserted.error) {
    // A concurrent sync won the race; adopt its envelope rather than failing.
    if (inserted.error.code === UNIQUE_VIOLATION) {
      const raced = await lookupEnvelope(supabase, organizationId, mailbox, externalMessageId);
      if (raced.error) throw raced.error;
      if (raced.data) {
        return {
          envelope_id: raced.data.id as string,
          envelope_status: raced.data.envelope_status as string,
          routing_decision: raced.data.routing_decision as string | null,
          created: false,
        };
      }
    }
    throw inserted.error;
  }

  const envelopeId = inserted.data.id as string;
  for (const event of events) {
    const written = await supabase.from('provider_inbound_envelope_events').insert({
      organization_id: organizationId,
      envelope_id: envelopeId,
      event_type: event.event_type,
      event_metadata: event.event_metadata,
    });
    if (written.error) throw written.error;
  }

  return {
    envelope_id: envelopeId,
    envelope_status: row.envelope_status,
    routing_decision: row.routing_decision,
    created: true,
  };
}
