import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/_shared/provider-agent-thread-resolution.ts', import.meta.url), 'utf8');

test('candidates are sourced from the Carrier CRM anchor, contacts and external references', () => {
  // provider_relationships.vendor_id -> public.vendors is the compatibility anchor the
  // brief requires be preserved, so onboarding, Provider 360 and the Carrier CRM key
  // off the same identifier.
  assert.match(source, /\.from\('provider_relationships'\)[\s\S]*?select\('id,vendor_id/);
  assert.match(source, /\.from\('provider_relationship_contacts'\)/);
  assert.match(source, /\.from\('provider_external_references'\)/);
  assert.match(source, /\.from\('vendors'\)\.select\('id,vendor_name,legal_name,domain,primary_email,secondary_emails'\)/);
});

test('terminated relationships are excluded from matching', () => {
  assert.match(source, /\.neq\('lifecycle_status', 'terminated'\)/);
});

test('every candidate is persisted, including the ones that lost', () => {
  // An operator must be able to see why a thread linked, and why the alternatives did not.
  assert.match(source, /for \(const candidate of result\.candidates\)/);
  assert.match(source, /\.from\('provider_communication_match_candidates'\)\.upsert\(/);
  assert.match(source, /evaluated_by: 'agent'/);
  assert.match(source, /onConflict: 'organization_id,thread_id,provider_relationship_id,match_basis'/);
});

test('a thread links only on an unambiguous auto-link', () => {
  assert.match(source, /if \(!result\.auto_link\) \{/);
  assert.match(source, /matching_status: result\.decision === 'unmatched' \? 'unmatched' : 'needs_review'/);
});

test('an already-resolved thread is never overwritten by a later automatic pass', () => {
  // A human decision outranks the agent; the guard makes that structural.
  assert.match(source, /\.in\('matching_status', \['unmatched', 'needs_review'\]\)/);
  assert.match(source, /decision: 'already_resolved'/);
});

test('the resolved vendor id is returned so Rateware surfaces stay keyed together', () => {
  assert.match(source, /vendorByRelationship/);
  assert.match(source, /vendor_id: vendorByRelationship\.get\(relationshipId\) \?\? null/);
});

test('every query is scoped to the organization and the legal entity', () => {
  const scoped = source.match(/\.eq\('organization_id', organizationId\)/g) || [];
  assert.ok(scoped.length >= 5, `expected organization scoping on every query, found ${scoped.length}`);
  assert.match(source, /\.eq\('legal_entity_id', legalEntityId\)/);
});

test('match scoring is delegated, not reimplemented', () => {
  // The scoring rules live in one tested module; duplicating them here would let the
  // persisted confidence drift from the documented bases.
  assert.match(source, /import \{ AUTO_LINK_THRESHOLD, scoreProviderMatch \} from '\.\/provider-agent-resolution\.mjs';/);
  const code = source.replace(/\/\/[^\n]*/g, '');
  // No confidence value or threshold may be written here — those belong to the
  // scoring module, and a duplicate would drift from the documented bases.
  assert.ok(!/confidence[^:]*[:=]\s*0?\.\d/.test(code), 'confidence values must not be hardcoded here');
  assert.ok(!/>=\s*0?\.9|AUTO_LINK_THRESHOLD\s*=/.test(code), 'the auto-link threshold must not be redefined here');
});
