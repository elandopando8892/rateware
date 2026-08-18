// Agent step 1: turn an inbound thread into a provider-linked thread.
//
// Until now provider-gmail-sync.ts wrote every thread as matching_status
// 'unmatched' / match_method 'none', so intake was a mail archive. This resolves the
// thread against existing provider relationships, records explainable candidates, and
// links the thread only when the evidence is strong and unambiguous.
//
// Rateware integration: candidates are sourced from the Carrier CRM anchor
// (provider_relationships.vendor_id -> public.vendors) plus relationship contacts and
// external references, and the resolved vendor_id is returned so the onboarding case,
// Provider 360 and the Carrier CRM all key off the same identifier.

import { AUTO_LINK_THRESHOLD, scoreProviderMatch } from './provider-agent-resolution.mjs';

type Signals = {
  from_email?: string | null;
  reply_to_email?: string | null;
  subject?: string | null;
  body_text?: string | null;
  sender_name?: string | null;
};

/** Loads the candidate set for one legal entity, joined to its Carrier CRM vendor row. */
export async function loadProviderMatchCandidates(
  supabase: any,
  organizationId: string,
  legalEntityId: string,
) {
  const relationships = await supabase
    .from('provider_relationships')
    .select('id,vendor_id,legal_entity_id,vendor_code,vendor_number')
    .eq('organization_id', organizationId)
    .eq('legal_entity_id', legalEntityId)
    .neq('lifecycle_status', 'terminated');
  if (relationships.error) throw relationships.error;
  const rows = (relationships.data || []) as Record<string, any>[];
  if (!rows.length) return [];

  const relationshipIds = rows.map((row) => row.id);
  const vendorIds = [...new Set(rows.map((row) => row.vendor_id).filter(Boolean))];

  const [contacts, references, vendors] = await Promise.all([
    supabase.from('provider_relationship_contacts')
      .select('provider_relationship_id,email')
      .eq('organization_id', organizationId)
      .in('provider_relationship_id', relationshipIds)
      .eq('status', 'active'),
    supabase.from('provider_external_references')
      .select('provider_relationship_id,reference_type,external_value')
      .eq('organization_id', organizationId)
      .in('provider_relationship_id', relationshipIds),
    vendorIds.length
      ? supabase.from('vendors').select('id,vendor_name,legal_name,domain,primary_email,secondary_emails').in('id', vendorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [contacts, references, vendors]) if (result.error) throw result.error;

  const vendorById = new Map((vendors.data || []).map((row: any) => [row.id, row]));
  const emailsByRelationship = new Map<string, string[]>();
  for (const row of contacts.data || []) {
    if (!row.email) continue;
    const list = emailsByRelationship.get(row.provider_relationship_id) || [];
    list.push(String(row.email).toLowerCase());
    emailsByRelationship.set(row.provider_relationship_id, list);
  }
  const refsByRelationship = new Map<string, { mc: string[]; dot: string[] }>();
  for (const row of references.data || []) {
    const entry = refsByRelationship.get(row.provider_relationship_id) || { mc: [], dot: [] };
    const type = String(row.reference_type || '').toLowerCase();
    if (type.includes('mc')) entry.mc.push(String(row.external_value));
    if (type.includes('dot')) entry.dot.push(String(row.external_value));
    refsByRelationship.set(row.provider_relationship_id, entry);
  }

  return rows.map((row) => {
    const vendor = vendorById.get(row.vendor_id) || {};
    const refs = refsByRelationship.get(row.id) || { mc: [], dot: [] };
    const vendorEmails = [vendor.primary_email, ...(vendor.secondary_emails || [])]
      .filter(Boolean).map((email: string) => String(email).toLowerCase());
    return {
      id: row.id,
      vendor_id: row.vendor_id,
      legal_entity_id: row.legal_entity_id,
      display_name: vendor.legal_name || vendor.vendor_name || null,
      contact_emails: [...new Set([...(emailsByRelationship.get(row.id) || []), ...vendorEmails])],
      domains: vendor.domain ? [String(vendor.domain).toLowerCase()] : [],
      mc_numbers: refs.mc,
      dot_numbers: refs.dot,
    };
  });
}

/**
 * Resolves a thread and persists the outcome.
 *
 * Writes every candidate for auditability — including the ones that lost — so an
 * operator can see why a thread linked or why it did not. Links the thread only on an
 * unambiguous candidate at or above the auto-link threshold; anything else leaves the
 * thread unmatched with candidates queued for a human.
 */
export async function resolveProviderThread(
  supabase: any,
  input: { organization_id: string; legal_entity_id: string; thread_id: string; signals: Signals },
) {
  const organizationId = String(input.organization_id);
  const legalEntityId = String(input.legal_entity_id);
  const threadId = String(input.thread_id);

  const relationships = await loadProviderMatchCandidates(supabase, organizationId, legalEntityId);
  const result = scoreProviderMatch(input.signals, relationships);
  const vendorByRelationship = new Map(relationships.map((row) => [row.id, row.vendor_id]));

  for (const candidate of result.candidates) {
    const upsert = await supabase.from('provider_communication_match_candidates').upsert({
      organization_id: organizationId,
      thread_id: threadId,
      legal_entity_id: legalEntityId,
      provider_relationship_id: candidate.provider_relationship_id,
      match_basis: candidate.match_basis,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      evaluated_by: 'agent',
    }, { onConflict: 'organization_id,thread_id,provider_relationship_id,match_basis' });
    if (upsert.error) throw upsert.error;
  }

  if (!result.auto_link) {
    const update = await supabase.from('provider_communication_threads').update({
      matching_status: result.decision === 'unmatched' ? 'unmatched' : 'needs_review',
      match_method: 'agent_scored',
    }).eq('organization_id', organizationId).eq('id', threadId);
    if (update.error) throw update.error;
    return {
      thread_id: threadId,
      decision: result.decision,
      reason: result.reason,
      vendor_id: null,
      candidate_count: result.candidates.length,
    };
  }

  const relationshipId = result.auto_link.provider_relationship_id;
  // Only claim a thread that is still unmatched: a human decision already recorded
  // must never be overwritten by a later automatic pass.
  const linked = await supabase.from('provider_communication_threads').update({
    provider_relationship_id: relationshipId,
    matching_status: 'matched',
    match_method: `agent_${result.auto_link.match_basis}`,
  }).eq('organization_id', organizationId).eq('id', threadId)
    .in('matching_status', ['unmatched', 'needs_review'])
    .select('id').maybeSingle();
  if (linked.error) throw linked.error;
  if (!linked.data) {
    return { thread_id: threadId, decision: 'already_resolved', reason: 'thread_not_claimable', vendor_id: null, candidate_count: result.candidates.length };
  }

  return {
    thread_id: threadId,
    decision: 'matched',
    reason: result.auto_link.match_basis,
    confidence: result.auto_link.confidence,
    provider_relationship_id: relationshipId,
    vendor_id: vendorByRelationship.get(relationshipId) ?? null,
    candidate_count: result.candidates.length,
    auto_link_threshold: AUTO_LINK_THRESHOLD,
  };
}
