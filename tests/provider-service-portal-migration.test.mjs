import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const invite=readFileSync(new URL('../supabase/migrations/20260813190000_provider_portal_invitations.sql',import.meta.url),'utf8');
const access=readFileSync(new URL('../supabase/migrations/20260813190010_provider_portal_requirement_access.sql',import.meta.url),'utf8');
test('portal tokens are digest-only',()=>{assert.match(invite,/token_hash text not null/);assert.doesNotMatch(invite,/plaintext_token/);});
test('portal checklist exposure is explicit',()=>{assert.match(access,/activation_requirement_id uuid not null/);assert.match(access,/provider_label text not null/);});
