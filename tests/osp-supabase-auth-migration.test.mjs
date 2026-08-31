import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260830234500_osp_supabase_auth_principal_bindings.sql',
  import.meta.url,
), 'utf8');

test('OSP Supabase Auth foundation is expand-only and creates no user or active binding', () => {
  assert.match(migration, /create table osp_private\.auth_principal_bindings/i);
  assert.match(migration, /references auth\.users\(id\) on delete restrict/i);
  assert.match(migration, /status text not null default 'needs_review'/i);
  assert.doesNotMatch(migration, /insert\s+into\s+(?:auth\.users|osp_private\.auth_principal_bindings)/i);
  assert.doesNotMatch(migration, /update\s+auth\.users/i);
});

test('OSP Supabase Auth permissions preserve separation of duties and fail closed', () => {
  assert.match(migration, /primary_permission is null or primary_permission in\s*\([\s\S]*'osp:operate'[\s\S]*'osp:signature-approve'[\s\S]*'osp:sales-authorize'/i);
  assert.doesNotMatch(migration, /primary_permission[\s\S]*osp:send-authorized/i);
  assert.match(migration, /status = 'active'/i);
  assert.match(migration, /candidate\.email = token_email/i);
  assert.match(migration, /lower\(btrim\(coalesce\(auth_user\.email, ''\)\)\) = candidate\.email/i);
  assert.match(migration, /claims := \(event -> 'claims'\) - 'osp_organization_id' - 'osp_permissions'/i);
});

test('OSP Auth tables and hook are not directly exposed to browser roles', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on table osp_private\.auth_principal_bindings from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.osp_custom_access_token_hook\(jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.osp_custom_access_token_hook\(jsonb\) to supabase_auth_admin/i);
});
