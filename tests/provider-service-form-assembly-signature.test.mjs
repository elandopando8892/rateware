import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814150000_provider_onboarding_form_assembly.sql',import.meta.url),'utf8');
const assembly=readFileSync(new URL('../supabase/functions/_shared/provider-onboarding-form-assembly.ts',import.meta.url),'utf8');

test('Build 28 creates private templates, mappings, signature consent, assemblies, and events',()=>{
  for(const token of ['provider_onboarding_form_templates','provider_onboarding_form_field_mappings','provider_onboarding_signature_authorizations','provider_onboarding_form_assemblies','provider_onboarding_form_assembly_events']){
    assert.match(migration,new RegExp(token));
  }
});
test('templates and outputs are confined to the private entity vault',()=>{
  assert.match(migration,/storage_bucket='provider-entity-vault'/);
  assert.match(migration,/storage_path like 'templates\/%'/);
  assert.match(migration,/output_storage_path like 'assembled\/%'/);
  assert.match(assembly,/outputPath=\`assembled\//);
  assert.match(assembly,/Assembler returned an invalid private artifact/);
});
test('stored signature use requires explicit scoped consent and verified private asset',()=>{
  assert.match(assembly,/consent\.affirmed!==true/);
  assert.match(assembly,/scopeSha=await sha256/);
  assert.match(assembly,/Verified private signature asset was not found/);
  assert.match(assembly,/authorization_status:'consumed'/);
  assert.match(migration,/signature_method='stored_signature_asset' and signature_document_asset_id is not null/);
});
test('assembly revalidates approved unexpired manifest and disclosure before reading values',()=>{
  assert.match(assembly,/eq\('package_status','approved'\)/);
  assert.match(assembly,/eq\('manifest_sha256',claimed\.data\.input_manifest_sha256\)/);
  assert.match(assembly,/Release package authorization expired/);
  assert.match(assembly,/packageItem\.disclosure_mode==='full'/);
  const valueRead=assembly.indexOf("select('id,field_code,fact_value,fact_value_sha256')");
  const itemRead=assembly.indexOf("provider_onboarding_release_package_items");
  assert.ok(valueRead>itemRead);
});
test('worker uses a bounded lease and fails closed',()=>{
  assert.match(assembly,/processing_lease_token:leaseToken/);
  assert.match(assembly,/processing_lease_expires_at:new Date\(Date\.now\(\)\+5\*60000\)/);
  assert.match(assembly,/assembly_status:'failed'/);
  assert.match(assembly,/assembly_failed/);
});
test('Build 28 assembles privately but grants no delivery authority',()=>{
  assert.doesNotMatch(assembly,/send_email|gmail|createSignedUrl|signed_url|publicUrl/);
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy/i);
  for(const table of ['provider_onboarding_form_templates','provider_onboarding_form_field_mappings','provider_onboarding_signature_authorizations','provider_onboarding_form_assemblies','provider_onboarding_form_assembly_events']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
});
