import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../supabase/functions/_shared/provider-entity-document-processor.ts');
const migration=read('../supabase/migrations/20260814080000_provider_entity_processing_worker.sql');
const syntax=read('../tools/validate-provider-service-runtime-syntax.mjs');

test('worker uses bounded leases and only claims uploaded records',()=>{
  assert.match(migration,/processing_lease_token uuid/);
  assert.match(migration,/processing_attempts>=0 and processing_attempts<=25/);
  assert.match(worker,/\.eq\('ingestion_status','uploaded'\)/);
  assert.match(worker,/processing_lease_expires_at:leaseExpiresAt/);
  assert.match(worker,/Processing lease was lost/);
});
test('worker computes SHA-256 and quarantines mismatches or unsafe scans',()=>{
  assert.match(worker,/crypto\.subtle\.digest\('SHA-256',bytes\)/);
  assert.match(worker,/sha256_mismatch/);
  assert.match(worker,/malware_detected/);
  assert.match(worker,/malware_scan_error/);
  assert.match(worker,/classification_review_required/);
});
test('ready requires a clean scan, classification threshold, and review-only asset',()=>{
  assert.match(worker,/scan\.status!=='clean'/);
  assert.match(worker,/confidence<0\.8/);
  assert.match(worker,/verification_status:'needs_review'/);
  assert.match(worker,/ingestion_status:'ready'/);
  assert.match(worker,/releasePolicy=\['restricted','highly_restricted'\]\.includes\(sensitivity\)\?'approval_required':'review_required'/);
});
test('worker has no release, email, signature, or public route authority',()=>{
  assert.doesNotMatch(worker,/provider_legal_entity_release_packages|gmail\.send|signature_operation|Deno\.serve/);
  assert.doesNotMatch(worker,/verification_status:'verified'/);
  assert.match(syntax,/provider-entity-document-processor\.ts/);
});
