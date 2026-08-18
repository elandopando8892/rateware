// Runtime proof for the neutral inbox envelope.
//
// The .mjs plan tests cover the decision rules. This one covers everything the
// rules cannot: the composite foreign key into legal_entities, the check
// constraints on routed/non-routed shape, the unique key that makes a replay
// idempotent, and — the reason this file exists — whether service_role actually
// holds the grants to write these tables at all.
//
// This branch has three times shipped a green gate over a path nothing executed:
// orphaned modules nothing imported, a security_invoker view with no base-table
// grants, and 30 of 35 tables with no service_role grant. Structural tests, the
// syntax gate, the contract validator and clean replay all passed throughout.
// None of them runs a query. This one does.
//
//   supabase start && supabase db reset
//   deno test --allow-net --allow-env tests/provider-inbound-envelope-runtime.test.ts
//
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, defaulting to the local stack's
// well-known development values. It refuses to run against anything else.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { Client as PostgresClient } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
import { recordInboundEnvelope } from '../supabase/functions/_shared/provider-inbound-envelope.ts';

const LOCAL_URL = 'http://127.0.0.1:54321';
const url = Deno.env.get('SUPABASE_URL') || LOCAL_URL;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// A service-role key is a production credential. This suite writes rows, so it is
// restricted to a loopback stack by construction rather than by convention.
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(url)) {
  throw new Error(`refusing to run write tests against a non-local stack: ${url}`);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = crypto.randomUUID().slice(0, 8);
let organizationId = '';
let mexicoEnvelopeId = '';

/** Fails loudly rather than letting an absent fixture read as a passing assertion. */
function entityId(entities: Array<Record<string, string>>, code: string) {
  const found = entities.find((entry) => entry.entity_code === code);
  if (!found) throw new Error(`fixture legal entity ${code} was not created`);
  return found.id;
}

// The fixture is seeded with the owner role, not with service_role.
//
// service_role deliberately holds no INSERT on `organizations` — the application
// never creates one, and widening the grant so a test could would weaken exactly
// the thing this suite exists to verify. So the fixture uses elevated rights and
// the code under test keeps the runtime role it will actually have in production.
const ADMIN_DSN = Deno.env.get('SUPABASE_DB_URL')
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function withAdmin<T>(run: (client: PostgresClient) => Promise<T>) {
  const client = new PostgresClient(ADMIN_DSN);
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function seed() {
  return await withAdmin(async (client) => {
    const org = await client.queryObject<{ id: string }>`
      insert into public.organizations (owner_email, org_name)
      values (${`envelope-runtime-${suffix}@example.invalid`}, ${`Envelope Runtime ${suffix}`})
      returning id`;
    organizationId = org.rows[0].id;

    const entities = await client.queryObject<{ id: string; entity_code: string }>`
      insert into public.legal_entities
        (organization_id, entity_code, country_code, legal_name, status, default_currency)
      values
        (${organizationId}, 'RTMX', 'MX', 'Synthetic Logistics MX', 'active', 'MXN'),
        (${organizationId}, 'RTUS', 'US', 'Synthetic Freight US', 'active', 'USD')
      returning id, entity_code`;
    return entities.rows;
  });
}

async function cleanup() {
  if (!organizationId) return;
  // legal_entities references organizations ON DELETE RESTRICT, so the fixture has
  // to be torn down in dependency order. Envelope events cascade from envelopes.
  await withAdmin(async (client) => {
    await client.queryArray`delete from public.provider_inbound_envelopes where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.legal_entities where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.organizations where id = ${organizationId}`;
  });
}

Deno.test('the neutral inbox envelope, against a real database', async (t) => {
  const entities = await seed();

  await t.step('service_role can write an envelope at all', async () => {
    // The grant check. If service_role lacks INSERT this throws, and every other
    // step in this file is meaningless — which is exactly the failure mode that
    // reached production twice on this branch.
    const result = await recordInboundEnvelope(supabase, {
      organization_id: organizationId,
      mailbox_reference: 'carriers@xbfreight.com',
      external_message_id: `msg-mx-${suffix}`,
      external_thread_id: `thread-${suffix}`,
      entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 0.92 },
      metadata: { request_type: 'customer_setup', attachment_count: 2 },
    });
    assertEquals(result.created, true);
    assertEquals(result.envelope_status, 'routed');
    assertEquals(result.routing_decision, 'mexico');
    mexicoEnvelopeId = result.envelope_id;
  });

  await t.step('the stored row satisfies the routed-shape constraint', async () => {
    const stored = await supabase.from('provider_inbound_envelopes')
      .select('legal_entity_id, entity_code, routing_decision, routing_confidence, routed_at, routed_by_type, review_reason')
      .eq('organization_id', organizationId)
      .eq('external_message_id', `msg-mx-${suffix}`)
      .single();
    if (stored.error) throw stored.error;
    // The composite FK (organization_id, legal_entity_id, entity_code) accepted it,
    // which means routing resolved to a real entity in the right tenant.
    assertEquals(stored.data.legal_entity_id, entityId(entities, 'RTMX'));
    assertEquals(stored.data.entity_code, 'RTMX');
    assertEquals(Number(stored.data.routing_confidence), 0.92);
    assertEquals(stored.data.routed_by_type, 'rule');
    assertEquals(stored.data.review_reason, null);
    assert(stored.data.routed_at, 'a routed envelope carries routed_at');
  });

  await t.step('both routing events were appended', async () => {
    const events = await supabase.from('provider_inbound_envelope_events')
      .select('event_type')
      .eq('organization_id', organizationId)
      .eq('envelope_id', mexicoEnvelopeId)
      .order('occurred_at', { ascending: true });
    if (events.error) throw events.error;
    const types = (events.data || []).map((row) => row.event_type);
    assertEquals(types, ['received', 'routed']);
  });

  await t.step('a replayed message does not duplicate the envelope', async () => {
    const replay = await recordInboundEnvelope(supabase, {
      organization_id: organizationId,
      mailbox_reference: 'carriers@xbfreight.com',
      external_message_id: `msg-mx-${suffix}`,
      external_thread_id: `thread-${suffix}`,
      // Deliberately a different decision: the replay must adopt the stored
      // routing, not overwrite a decision a human may already have reviewed.
      entity: { entity_kind: 'united_states', decision: 'resolved', confidence: 1 },
    });
    assertEquals(replay.created, false);
    assertEquals(replay.routing_decision, 'mexico');

    const count = await supabase.from('provider_inbound_envelopes')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('external_message_id', `msg-mx-${suffix}`);
    if (count.error) throw count.error;
    assertEquals(count.count, 1);
  });

  await t.step('a differently-cased mailbox is the same envelope', async () => {
    const same = await recordInboundEnvelope(supabase, {
      organization_id: organizationId,
      mailbox_reference: '  Carriers@XBFreight.COM ',
      external_message_id: `msg-mx-${suffix}`,
      entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 0.92 },
    });
    assertEquals(same.created, false);
  });

  await t.step('an ambiguous entity is stored as needs_review, naming no entity', async () => {
    const result = await recordInboundEnvelope(supabase, {
      organization_id: organizationId,
      mailbox_reference: 'carriers@xbfreight.com',
      external_message_id: `msg-ambiguous-${suffix}`,
      entity: {
        entity_kind: 'mexico', decision: 'needs_review',
        basis: 'conflicting_evidence', confidence: 0.5,
      },
    });
    assertEquals(result.envelope_status, 'needs_review');

    const stored = await supabase.from('provider_inbound_envelopes')
      .select('legal_entity_id, entity_code, routed_at, review_reason')
      .eq('organization_id', organizationId)
      .eq('external_message_id', `msg-ambiguous-${suffix}`)
      .single();
    if (stored.error) throw stored.error;
    assertEquals(stored.data.legal_entity_id, null);
    assertEquals(stored.data.entity_code, null);
    assertEquals(stored.data.routed_at, null);
    assertEquals(stored.data.review_reason, 'conflicting_evidence');
  });

  await t.step('the US jurisdiction routes to the US entity', async () => {
    const result = await recordInboundEnvelope(supabase, {
      organization_id: organizationId,
      mailbox_reference: 'carriers@xbfreight.com',
      external_message_id: `msg-us-${suffix}`,
      entity: { entity_kind: 'united_states', decision: 'resolved', confidence: 0.88 },
    });
    assertEquals(result.routing_decision, 'united_states');
    const stored = await supabase.from('provider_inbound_envelopes')
      .select('legal_entity_id')
      .eq('organization_id', organizationId)
      .eq('external_message_id', `msg-us-${suffix}`)
      .single();
    if (stored.error) throw stored.error;
    assertEquals(stored.data.legal_entity_id, entityId(entities, 'RTUS'));
    assertNotEquals(stored.data.legal_entity_id, entityId(entities, 'RTMX'));
  });

  await t.step('the events table refuses an update, as an append-only log must', async () => {
    // service_role holds select and insert only. If an update ever succeeds, the
    // audit trail is rewritable and the migration's guarantee is gone.
    const attempt = await supabase.from('provider_inbound_envelope_events')
      .update({ event_type: 'rejected' })
      .eq('organization_id', organizationId);
    assertNotEquals(attempt.error, null, 'updating an append-only event must fail');
  });

  await cleanup();
});
