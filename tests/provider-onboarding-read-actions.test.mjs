import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/provider-onboarding-api/provider-service.ts', import.meta.url), 'utf8');
const ACTIONS = [
  'list_provider_entity_vault',
  'list_provider_onboarding_field_review',
  'list_provider_onboarding_approvals',
  'list_provider_onboarding_delivery',
];

function handlerBody(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `handler ${name} not found`);
  const next = source.indexOf('\nasync function ', start + 1);
  const exported = source.indexOf('\nexport async function ', start + 1);
  const end = Math.min(...[next, exported].filter((index) => index > 0));
  return source.slice(start, Number.isFinite(end) ? end : source.length);
}

test('every new read action is registered and dispatched', () => {
  for (const action of ACTIONS) {
    assert.match(source, new RegExp(`"${action}",`), `${action} is not in PROVIDER_SERVICE_ACTIONS`);
    assert.match(source, new RegExp(`if \\(action === "${action}"\\)`), `${action} is not dispatched`);
  }
});

test('every new handler filters on the resolved organization, never a browser-supplied id', () => {
  for (const name of ['listProviderEntityVault', 'listProviderOnboardingFieldReview', 'listProviderOnboardingApprovals', 'listProviderOnboardingDelivery']) {
    const body = handlerBody(name);
    assert.match(body, /\.eq\("organization_id", organizationUuid\)/, `${name} must scope to the resolved tenant`);
    assert.ok(!/body\.organization_id/.test(body), `${name} must not read an organization id from the request body`);
  }
});

test('list handlers clamp limit and offset rather than trusting the caller', () => {
  for (const name of ['listProviderEntityVault', 'listProviderOnboardingApprovals', 'listProviderOnboardingDelivery']) {
    const body = handlerBody(name);
    assert.match(body, /clampInteger\(body\.limit, 40, 10, 100\)/, `${name} must clamp limit`);
    assert.match(body, /clampInteger\(body\.offset, 0, 0, 100000\)/, `${name} must clamp offset`);
  }
  // The field review handler is bounded by a single review rather than paged.
  assert.match(handlerBody('listProviderOnboardingFieldReview'), /\.limit\(400\)/);
});

test('unsupported queue names are rejected instead of silently widening the result', () => {
  for (const name of ['listProviderEntityVault', 'listProviderOnboardingApprovals', 'listProviderOnboardingDelivery']) {
    assert.match(handlerBody(name), /throw new ClientError\("Unsupported [^"]+ queue\."\)/, `${name} must reject unknown queues`);
  }
});

test('identifiers from the request body are validated as UUIDs', () => {
  assert.match(handlerBody('listProviderOnboardingFieldReview'), /requireUuid\(body\.review_id, "review_id"\)/);
  assert.match(handlerBody('listProviderEntityVault'), /optionalUuid\(body\.legal_entity_id, "legal_entity_id"\)/);
  assert.match(handlerBody('listProviderOnboardingApprovals'), /optionalUuid\(body\.case_id, "case_id"\)/);
  assert.match(handlerBody('listProviderOnboardingDelivery'), /optionalUuid\(body\.case_id, "case_id"\)/);
});

test('free-text search is sanitized before reaching a filter expression', () => {
  assert.match(handlerBody('listProviderEntityVault'), /safeSearch\(body\.search\)/);
});

test('handlers read the sanitized views, never the underlying private tables', () => {
  const views = {
    listProviderEntityVault: 'provider_entity_vault_workspace',
    listProviderOnboardingFieldReview: 'provider_onboarding_field_review',
    listProviderOnboardingApprovals: 'provider_onboarding_approval_queue',
    listProviderOnboardingDelivery: 'provider_onboarding_delivery_workspace',
  };
  const forbidden = [
    'provider_legal_entity_document_assets',
    'provider_entity_document_review_fields',
    'provider_onboarding_outbound_messages',
    'provider_onboarding_release_packages',
  ];
  for (const [name, view] of Object.entries(views)) {
    const body = handlerBody(name);
    assert.match(body, new RegExp(`\\.from\\("${view}"\\)`), `${name} must read ${view}`);
    for (const table of forbidden) {
      assert.ok(!body.includes(`"${table}"`), `${name} must not read the private table ${table}`);
    }
  }
});

test('empty pages fall back to an aggregate row so counters cannot read as zero', () => {
  // Same defect class already fixed in listProviderOnboardingWorkspace: the
  // org-wide window aggregates ride on every row, so an empty page carries none.
  for (const name of ['listProviderEntityVault', 'listProviderOnboardingApprovals', 'listProviderOnboardingDelivery']) {
    const body = handlerBody(name);
    assert.match(body, /if \(!metricsRow\) \{/, `${name} must handle an empty page`);
    assert.match(body, /\.limit\(1\)\s*\n\s*\.maybeSingle\(\);/, `${name} must fall back to an aggregate row`);
  }
});
