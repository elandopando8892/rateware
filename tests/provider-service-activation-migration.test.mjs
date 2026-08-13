import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const core = readFileSync(new URL('../supabase/migrations/20260813130000_provider_service_activation_core_tables.sql', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../supabase/migrations/20260813131000_provider_service_activation_readiness_views.sql', import.meta.url), 'utf8');
const commands = [
  '../supabase/migrations/20260813132000_provider_service_activation_guards.sql',
  '../supabase/migrations/20260813132100_provider_service_activation_commands.sql',
  '../supabase/migrations/20260813132200_provider_service_activation_exception_commands.sql',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
const security = readFileSync(new URL('../supabase/migrations/20260813133000_provider_service_activation_security.sql', import.meta.url), 'utf8');

const canonicalTracks = [
  'provider_readiness',
  'xbf_customer_setup',
  'commercial_operational_readiness',
];

test('creates a versioned activation model under the stable provider relationship', () => {
  for (const table of [
    'provider_activation_templates',
    'provider_activation_template_requirements',
    'provider_activations',
    'provider_activation_requirements',
    'provider_activation_evidence_links',
    'provider_activation_exceptions',
    'provider_activation_events',
  ]) {
    assert.match(core, new RegExp(`create table if not exists public\\.${table}`));
  }

  assert.match(core, /provider_activations_one_open_relationship_idx/);
  assert.match(core, /where status in \('in_progress', 'under_review', 'blocked', 'ready'\)/);
  assert.doesNotMatch(core, /carriers@xbfreight\.com/i);
  assert.doesNotMatch(core, /gmail/i);
});

test('calculates readiness across all three canonical tracks and fails closed', () => {
  for (const track of canonicalTracks) {
    assert.match(readiness, new RegExp(track));
  }

  assert.match(readiness, /then 'not_configured'/);
  assert.match(readiness, /then 'blocked'/);
  assert.match(readiness, /ready_track_count = 3/);
  assert.match(readiness, /overall\.readiness_state = 'ready' as can_activate/);
});

test('requires explicit expiring exceptions and blocks direct activation shortcuts', () => {
  assert.match(core, /expires_at > effective_from/);
  assert.match(commands, /p_expires_at is null or p_expires_at <= effective_from_value/);
  assert.match(commands, /readiness_row\.readiness_state <> 'ready'/);
  assert.match(commands, /Provider relationship cannot activate/);
  assert.match(commands, /provider_service_activate_relationship/);
});

test('keeps events append-only and browser writes closed', () => {
  assert.match(commands, /Provider activation events are append-only/);
  assert.match(security, /from public, anon, authenticated, service_role/);
  assert.match(security, /grant select on table public\.provider_activations to service_role/);
  assert.doesNotMatch(security, /grant (insert|update|delete) on table public\.provider_activations to service_role/i);
  assert.match(security, /grant execute on function public\.provider_service_activate_relationship/);
});
