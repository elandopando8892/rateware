import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814160000_provider_onboarding_gmail_delivery.sql',import.meta.url),'utf8');
const delivery=readFileSync(new URL('../supabase/functions/_shared/provider-onboarding-gmail-delivery.ts',import.meta.url),'utf8');

test('Build 29 creates mailbox policy, templates, outbound ledger, and events',()=>{
  for(const token of ['provider_onboarding_mailbox_policies','provider_onboarding_message_templates','provider_onboarding_outbound_messages','provider_onboarding_outbound_message_events']){
    assert.match(migration,new RegExp(token));
  }
});
test('mailbox and recipient are allowlisted before drafting and sending',()=>{
  assert.match(delivery,/Enabled mailbox policy was not found/);
  assert.match(delivery,/Recipient domain is not allowed by mailbox policy/);
  assert.match(delivery,/policyFor\(supabase,organizationId,claimed\.data\.mailbox_email/);
});
test('attachments require exact approved recipient, package, assembly, and hash',()=>{
  assert.match(delivery,/Email recipient differs from approved package recipient/);
  assert.match(delivery,/eq\('assembly_status','assembled'\)/);
  assert.match(delivery,/eq\('output_sha256',claimed\.data\.attachment_sha256\)/);
  assert.match(delivery,/Release authorization expired or recipient changed/);
  assert.match(delivery,/max_attachment_bytes/);
});
test('human delivery approval has separation of duties and revision guards',()=>{
  assert.match(migration,/approved_by_actor_id<>requested_by_actor_id/);
  assert.match(delivery,/Message requester cannot approve their own delivery/);
  assert.match(delivery,/eq\('revision',expectedRevision\)/);
  assert.match(delivery,/policy\.require_human_approval\|\|assemblyId/);
});
test('delivery is idempotent, leased, threaded, and schedules bounded followups',()=>{
  assert.match(migration,/idempotency_unique/);
  assert.match(delivery,/idempotencyKey:claimed\.data\.idempotency_key/);
  assert.match(delivery,/processing_lease_token:leaseToken/);
  assert.match(delivery,/gmail_thread_id/);
  assert.match(delivery,/max_followups/);
  assert.match(delivery,/followup_interval_hours/);
  assert.match(delivery,/Follow-up limit was reached/);
});
test('Build 29 exposes no direct database or public-storage authority',()=>{
  assert.doesNotMatch(delivery,/createSignedUrl|publicUrl|grant\s+execute/);
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy/i);
  for(const table of ['provider_onboarding_mailbox_policies','provider_onboarding_message_templates','provider_onboarding_outbound_messages','provider_onboarding_outbound_message_events']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
});
