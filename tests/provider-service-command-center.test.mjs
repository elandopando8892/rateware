import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeProviderServiceQueue,
  providerServiceAttentionRank,
  providerServiceRowSignals,
  shouldReplaceProviderServiceMetrics,
  sortProviderServiceRows,
  summarizeProviderServiceRows,
} from '../src/provider-service-page-domain.js';
import { shellModel } from '../src/platform55-shell-model.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260814010000_provider_service_command_center.sql');
const api = read('../supabase/functions/shipper-directory-api/provider-service.ts');
const page = read('../provider-service.html');
const controller = read('../src/provider-service-page.js');
const commandCenterPage = read('../app.html');
const vendorCrmPage = read('../vendors.html');

test('normalizes command center queues without inventing queue names', () => {
  assert.equal(normalizeProviderServiceQueue('CRITICAL'), 'critical');
  assert.equal(normalizeProviderServiceQueue('something-else'), 'all');
});

test('sorts critical and low-health relationships first', () => {
  const rows = sortProviderServiceRows([
    { vendor_name: 'Healthy', attention_state: 'healthy', health_score: 100 },
    { vendor_name: 'Critical B', attention_state: 'critical', health_score: 35 },
    { vendor_name: 'Critical A', attention_state: 'critical', health_score: 10 },
  ]);
  assert.deepEqual(rows.map((row) => row.vendor_name), ['Critical A', 'Critical B', 'Healthy']);
  assert.equal(providerServiceAttentionRank(rows[0]), 10);
});

test('summarizes global server metrics and exposes actionable signals', () => {
  const summary = summarizeProviderServiceRows([], {
    relationships: 20,
    critical: 2,
    attention: 4,
    needs_reply: 3,
    pending_approvals: 1,
    blocked_activation: 2,
  });
  assert.deepEqual(summary, {
    relationships: 20,
    critical: 2,
    attention: 4,
    needsReply: 3,
    pendingApprovals: 1,
    blockedActivation: 2,
  });
  assert.deepEqual(
    providerServiceRowSignals({ needs_reply_count: 2, required_integration_count: 3, ready_integration_count: 1 }),
    ['2 reply due', '1/3 integrations ready'],
  );
});

test('preserves the last global metric snapshot when a filtered queue is empty', () => {
  const currentMetrics = { relationships: 20, critical: 2 };
  assert.equal(shouldReplaceProviderServiceMetrics({ queue: 'critical', metrics: { relationships: 0 }, currentMetrics }), false);
  assert.equal(shouldReplaceProviderServiceMetrics({ queue: 'all', search: '', metrics: { relationships: 0 }, currentMetrics }), true);
  assert.equal(shouldReplaceProviderServiceMetrics({ queue: 'critical', metrics: { relationships: 20 }, currentMetrics }), true);
});

test('command center SQL remains sanitized, canonical, and service-role only', () => {
  assert.match(migration, /create or replace view public\.provider_service_command_center/);
  assert.match(migration, /join public\.workspace_registry/);
  assert.match(migration, /join public\.vendors/);
  assert.match(migration, /revoke all on table public\.provider_service_command_center from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.provider_service_command_center to service_role/);
  assert.doesNotMatch(migration, /vendor\.segment/);
  assert.doesNotMatch(migration, /tax_identifier|token_hash|storage_path|file_sha256|body_text|body_html|account_number/i);
});

test('internal Provider Service API exposes a bounded command-center action', () => {
  assert.match(api, /list_provider_service_command_center/);
  assert.match(api, /provider_service_command_center/);
  assert.match(api, /COMMAND_CENTER_QUEUES/);
  assert.match(api, /clampInteger\(body\.limit, 50, 10, 100\)/);
  assert.match(api, /resolveProviderServiceScope/);
});

test('Provider Service page is wired to command center and existing Provider 360 detail', () => {
  assert.match(page, /Provider Service 360/);
  assert.match(page, /data-provider-queue="critical"/);
  assert.match(page, /id="provider-service-detail"/);
  assert.match(controller, /list_provider_service_command_center/);
  assert.match(controller, /loadProviderService360/);
  assert.match(controller, /renderProviderService360/);
  assert.match(controller, /shouldReplaceProviderServiceMetrics/);
});

test('Provider Service is discoverable from Command Center and Carrier CRM navigation', () => {
  assert.match(commandCenterPage, /data-platform55-sidebar/);
  const providerServiceRoute = shellModel({ pageKey: 'app' }).navigation
    .find((route) => route.key === 'provider-service');
  assert.equal(providerServiceRoute?.path, './provider-service.html');
  assert.equal(providerServiceRoute?.group, 'Service');
  assert.equal(providerServiceRoute?.label, 'Provider Service');
  assert.match(vendorCrmPage, /href="\.\/provider-service\.html"[^>]*data-nav-code="PS">Provider Service<\/a>/);
});
