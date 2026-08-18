// Entity Vault document processor — the worker that moves an ingested document
// from 'uploaded' to 'ready' (or quarantine): it verifies the stored bytes against
// the expected hash, scans them with VirusTotal Private Scanning, classifies them
// by the deterministic filename rules, and — only on a clean scan and a confident
// classification — creates the vault asset and marks the ingestion ready.
//
// Internal by design: it holds the service role and the VirusTotal key, so it is
// gated on the service-role key rather than a user token. One document per call
// keeps a scan's poll loop inside the function's wall-clock limit; the caller loops
// until nothing pending remains.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { processProviderEntityDocument } from '../_shared/provider-entity-document-processor.ts';
import { createVirusTotalProcessor } from '../_shared/provider-entity-virustotal-scanner.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
// The edge runtime reserves the SUPABASE_ prefix, so the service role is read from
// the project's own RATEWARE_ secret — the same one every other function here uses.
const SERVICE_ROLE_KEY = Deno.env.get('RATEWARE_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VIRUSTOTAL_API_KEY = Deno.env.get('VIRUSTOTAL_API_KEY') || '';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const cleanUuid = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: 'service_configuration_missing' }, 500);
  if (!VIRUSTOTAL_API_KEY) return json({ ok: false, error: 'virustotal_key_missing' }, 503);

  // Internal gate: the caller presents a dedicated trigger secret. This worker is
  // driven by an operator process, not a browser, so it is gated on a shared secret
  // held only in the project's Edge Function secrets — never a user token.
  const triggerSecret = Deno.env.get('PROVIDER_PROCESSOR_TRIGGER') || '';
  const presented = (request.headers.get('x-processor-trigger') || '').trim();
  if (!triggerSecret || !presented || presented !== triggerSecret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const organizationId = cleanUuid(body.organization_id);
  if (!organizationId) return json({ ok: false, error: 'invalid_organization_id' }, 400);
  const limit = Math.min(Math.max(Number(body.limit) || 1, 1), 3);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const processor = createVirusTotalProcessor(VIRUSTOTAL_API_KEY, { timeoutMs: 90000 });

  const processed: Array<Record<string, unknown>> = [];
  for (let i = 0; i < limit; i += 1) {
    // Claim the next pending document. The processor re-claims atomically on
    // ingestion_status='uploaded', so two concurrent workers cannot both take it.
    const pending = await supabase.from('provider_entity_document_ingestions')
      .select('id, legal_entity_id')
      .eq('organization_id', organizationId)
      .eq('ingestion_status', 'uploaded')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pending.error) return json({ ok: false, error: 'pending_lookup_failed', detail: pending.error.message }, 500);
    if (!pending.data) break;

    try {
      const result = await processProviderEntityDocument(supabase, {
        organization_id: organizationId,
        legal_entity_id: pending.data.legal_entity_id,
        ingestion_id: pending.data.id,
      }, processor);
      // The result carries no document values — only ids and status.
      processed.push({ ingestion_id: pending.data.id, ingestion_status: result?.ingestion_status ?? 'unknown' });
    } catch (error) {
      processed.push({ ingestion_id: pending.data.id, ingestion_status: 'error', error: String((error as Error)?.message || 'process_failed').slice(0, 120) });
      break;
    }
  }

  const remaining = await supabase.from('provider_entity_document_ingestions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('ingestion_status', 'uploaded');

  return json({
    ok: true,
    processed,
    processed_count: processed.length,
    remaining: remaining.count ?? null,
  });
});
