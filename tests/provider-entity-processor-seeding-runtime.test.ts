// Runtime proof that promoting a document also seeds its human review.
//
// The seeding module was orphaned the moment it was written — only its unit test
// imported it, so a document promoted by the deployed processor would still have
// produced no review. This runs the real processor against a real database and
// asserts the review and its fields exist afterwards.
//
//   supabase start && supabase db reset
//   deno test --allow-net --allow-env tests/provider-entity-processor-seeding-runtime.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { Client as PostgresClient } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
import { processProviderEntityDocument } from '../supabase/functions/_shared/provider-entity-document-processor.ts';
import { createOperatorAttestedProcessor } from '../supabase/functions/_shared/provider-entity-operator-attested-scanner.mjs';

const LOCAL = 'http://127.0.0.1:54321';
const url = Deno.env.get('SUPABASE_URL') || LOCAL;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// This suite writes rows with a service-role key, so it is bound to a loopback
// stack by construction rather than by convention.
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(url)) {
  throw new Error(`refusing to run write tests against a non-local stack: ${url}`);
}

const ADMIN_DSN = Deno.env.get('SUPABASE_DB_URL') || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID().slice(0, 8);

async function withAdmin<T>(run: (client: PostgresClient) => Promise<T>) {
  const client = new PostgresClient(ADMIN_DSN);
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

Deno.test('promoting a document seeds its human review', async (t) => {
  let organizationId = '';
  let legalEntityId = '';
  let ingestionId = '';

  // The processor verifies the stored bytes against expected_sha256, so the fixture
  // must declare the real digest of the bytes it uploads.
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a]); // %PDF\n
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const expectedSha256 = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');

  await t.step('seed a W-9 ingestion whose bytes are already stored', async () => {
    const ids = await withAdmin(async (client) => {
      const org = await client.queryObject<{ id: string }>`
        insert into public.organizations (owner_email, org_name)
        values (${`seedrt-${suffix}@example.invalid`}, ${`SeedRT ${suffix}`}) returning id`;
      const orgId = org.rows[0].id;
      const ent = await client.queryObject<{ id: string }>`
        insert into public.legal_entities (organization_id, entity_code, country_code, legal_name, status, default_currency)
        values (${orgId}, 'SRUS', 'US', 'SeedRT US', 'active', 'USD') returning id`;
      const entId = ent.rows[0].id;
      const ing = crypto.randomUUID();
      const session = crypto.randomUUID();
      const issued = new Date();
      const expires = new Date(issued.getTime() + 10 * 60 * 1000);
      // The processor claims on ingestion_status='uploaded' with the bytes present.
      await client.queryArray`
        insert into public.provider_entity_document_ingestions
          (id, organization_id, legal_entity_id, ingestion_key, original_filename,
           declared_mime_type, declared_size_bytes, expected_sha256, source_channel,
           source_reference, requested_by_actor_type, requested_by_user_id, storage_path,
           upload_session_id, upload_issued_at, upload_expires_at,
           ingestion_status, upload_completed_at)
        values
          (${ing}, ${orgId}, ${entId}, ${'k_' + suffix}, ${'XBFus - W9.pdf'},
           'application/pdf', 5, ${expectedSha256}, 'manual',
           'import-entity-vault', 'user', 'kp_test', ${`${orgId}/${entId}/${ing}/XBFus - W9.pdf`},
           ${session}, ${issued.toISOString()}, ${expires.toISOString()},
           'uploaded', ${issued.toISOString()})`;
      return { orgId, entId, ing };
    });
    organizationId = ids.orgId; legalEntityId = ids.entId; ingestionId = ids.ing;

    const upload = await supabase.storage.from('provider-entity-vault')
      .upload(`${organizationId}/${legalEntityId}/${ingestionId}/XBFus - W9.pdf`, bytes, {
        contentType: 'application/pdf', upsert: false,
      });
    if (upload.error) throw upload.error;
  });

  await t.step('the processor promotes it and seeds the review in one pass', async () => {
    // The processor returns either a promotion or a quarantine; narrow on the
    // status so a quarantine fails loudly here instead of reading as a pass.
    const result = await processProviderEntityDocument(supabase, {
      organization_id: organizationId,
      legal_entity_id: legalEntityId,
      ingestion_id: ingestionId,
    }, createOperatorAttestedProcessor('kp_test')) as Record<string, unknown>;
    assertEquals(result.ingestion_status, 'ready', `expected promotion, got ${JSON.stringify(result)}`);
    // The regression this file exists for: seeding must not be silently skipped.
    assertEquals(result.review_seeded, true);
  });

  await t.step('the review carries the canonical facts a W-9 evidences', async () => {
    const review = await supabase.from('provider_entity_document_reviews')
      .select('id, review_status, review_reason')
      .eq('organization_id', organizationId).single();
    if (review.error) throw review.error;
    assertEquals(review.data.review_status, 'pending');
    assertEquals(review.data.review_reason, 'field_review');

    const fields = await supabase.from('provider_entity_document_review_fields')
      .select('field_code, sensitivity, proposed_value, field_status')
      .eq('organization_id', organizationId)
      .eq('review_id', review.data.id);
    if (fields.error) throw fields.error;
    const codes = (fields.data ?? []).map((f) => f.field_code).sort();
    assertEquals(codes, ['ein', 'entity_type', 'fiscal_address', 'legal_name', 'signature_date', 'signature_name']);
    // Nothing is proposed: §7 forbids inventing a tax id or a signature.
    for (const field of fields.data ?? []) {
      assertEquals(field.proposed_value, null);
      assertEquals(field.field_status, 'pending');
    }
    const ein = (fields.data ?? []).find((f) => f.field_code === 'ein');
    assertEquals(ein?.sensitivity, 'restricted');
  });

  // Tear down in dependency order: reviews reference the asset and the ingestion.
  await withAdmin(async (client) => {
    await client.queryArray`delete from public.provider_entity_document_review_fields where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.provider_entity_document_reviews where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.provider_entity_document_ingestion_events where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.provider_entity_document_ingestions where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.provider_legal_entity_document_assets where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.legal_entities where organization_id = ${organizationId}`;
    await client.queryArray`delete from public.organizations where id = ${organizationId}`;
  });
});
