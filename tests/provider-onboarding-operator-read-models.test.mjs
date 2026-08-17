import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260817100000_provider_onboarding_operator_read_models.sql', import.meta.url), 'utf8');
const VIEWS = ['provider_onboarding_field_review', 'provider_onboarding_approval_queue', 'provider_onboarding_delivery_workspace'];

test('all three operator surfaces are security-invoker views over existing tables', () => {
  for (const view of VIEWS) {
    assert.match(migration, new RegExp(`create or replace view public\\.${view}`), `missing view ${view}`);
  }
  assert.equal((migration.match(/security_invoker = true/g) || []).length, VIEWS.length);
  assert.doesNotMatch(migration, /create table/i, 'operator surfaces must not duplicate existing tables');
});

test('browser roles are revoked on every view and only service_role may select', () => {
  for (const view of VIEWS) {
    assert.match(migration, new RegExp(`revoke all on public\\.${view} from public, anon, authenticated;`));
  }
  assert.match(migration, /grant select on\s+public\.provider_onboarding_field_review,\s+public\.provider_onboarding_approval_queue,\s+public\.provider_onboarding_delivery_workspace\s+to service_role;/);
  assert.doesNotMatch(migration, /grant\s+(select|all)[^;]*to\s+(anon|authenticated)/i);
});

test('security-invoker views also grant the backend read access to their base tables', () => {
  // Without these the views exist but every service_role read fails with
  // "permission denied", which is a silent production outage.
  assert.match(migration, /grant select on table\s+public\.provider_entity_document_review_fields,\s+public\.provider_entity_document_reviews\s+to service_role;/);
});

test('restricted and highly restricted field values are withheld, not merely flagged', () => {
  assert.match(migration, /when f\.sensitivity in \('restricted','highly_restricted'\) then null\s+else f\.proposed_value\s+end as proposed_value/);
  assert.match(migration, /\(f\.sensitivity in \('restricted','highly_restricted'\)\) as value_withheld/);
  // The reviewer must still learn that a value exists without seeing it.
  assert.match(migration, /\(f\.proposed_value is not null\) as has_proposed_value/);
});

test('field value hashes are never projected', () => {
  const fieldView = migration.slice(migration.indexOf('provider_onboarding_field_review'), migration.indexOf('-- 2. Approval Center'));
  assert.ok(!fieldView.includes('proposed_value_sha256'));
  assert.ok(!fieldView.includes('reviewer_value,'), 'reviewer corrections are reported as a flag, not a value');
});

test('the approval queue reports manifest binding without exposing the manifest hash', () => {
  const approvalView = migration.slice(migration.indexOf('-- 2. Approval Center'), migration.indexOf('-- 3. Delivery Workspace'));
  assert.match(approvalView, /\(p\.manifest_sha256 is not null\) as manifest_bound/);
  assert.ok(!/select[\s\S]*\bp\.manifest_sha256,/.test(approvalView), 'the manifest hash must never be projected');
});

test('approval counting is scoped to the current package revision', () => {
  // Counting approvals across revisions would let a re-cut package inherit
  // approvals granted against different contents.
  assert.match(migration, /v\.package_revision = p\.revision/);
  assert.match(migration, /\(coalesce\(d\.approved_count, 0\) >= p\.required_approval_count\) as approval_complete/);
  assert.match(migration, /as separation_conflict/);
  assert.match(migration, /as authorization_expired/);
});

test('delivery exposes recipient and mailbox domains only, never addresses or content', () => {
  const deliveryView = migration.slice(migration.indexOf('-- 3. Delivery Workspace'));
  assert.match(deliveryView, /split_part\(m\.recipient_email, '@', 2\) as recipient_domain/);
  assert.match(deliveryView, /split_part\(m\.mailbox_email, '@', 2\) as mailbox_domain/);
  for (const column of ['m.subject_text', 'm.body_text', 'm.attachment_sha256,', 'm.gmail_message_id', 'm.gmail_thread_id,']) {
    assert.ok(!deliveryView.includes(column), `${column} must not be projected by the delivery workspace`);
  }
  assert.match(deliveryView, /\(m\.attachment_sha256 is not null\) as has_attachment/);
  assert.match(deliveryView, /\(m\.gmail_thread_id is not null\) as thread_bound/);
});

test('every counter is partitioned by organization', () => {
  const partitions = migration.match(/over \(partition by [a-z]\.organization_id/g) || [];
  assert.ok(partitions.length >= 5, `expected organization-partitioned counters, found ${partitions.length}`);
  assert.match(migration, /partition by f\.organization_id, f\.review_id/);
});

test('each view documents what it deliberately withholds', () => {
  for (const view of VIEWS) {
    assert.match(migration, new RegExp(`comment on view public\\.${view} is`), `missing comment for ${view}`);
  }
  assert.match(migration, /withholds proposed values for restricted and highly restricted fields/);
  assert.match(migration, /never the local part, subject, body or attachment hash/);
});
