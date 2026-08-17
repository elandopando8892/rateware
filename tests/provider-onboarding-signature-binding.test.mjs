import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260817130000_provider_onboarding_signature_template_binding.sql', import.meta.url), 'utf8');
const assembly = readFileSync(new URL('../supabase/functions/_shared/provider-onboarding-form-assembly.ts', import.meta.url), 'utf8');

function fn(name) {
  const start = assembly.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const next = assembly.indexOf('\nexport ', start + 1);
  return assembly.slice(start, next > 0 ? next : assembly.length);
}

test('consent records the template it was granted against and that template\'s hash', () => {
  assert.match(migration, /add column if not exists template_id uuid,\s+add column if not exists template_sha256 text;/);
  assert.match(migration, /foreign key \(organization_id, template_id\)\s+references public\.provider_onboarding_form_templates\(organization_id, id\)/);
});

test('a template binding without a valid hash is rejected by constraint', () => {
  assert.match(migration, /\(template_id is null and template_sha256 is null\)\s+or \(template_id is not null and template_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
});

test('authorization requires a template and reads its hash from an active template', () => {
  const body = fn('authorizeProviderOnboardingSignature');
  assert.match(body, /const templateId=uuid\(input\.template_id,'template_id'\)/);
  assert.match(body, /from\('provider_onboarding_form_templates'\)/);
  assert.match(body, /Active form template with a valid hash was not found\./);
  assert.match(body, /template_id:templateId,template_sha256:template\.data\.template_sha256/);
});

test('the template identity and hash are folded into the consent scope hash', () => {
  const body = fn('authorizeProviderOnboardingSignature');
  assert.match(body, /template_id:templateId,template_sha256:template\.data\.template_sha256,\s*\n\s*consent_text_version/);
});

test('queueing refuses a consent granted for a different template', () => {
  // The attack this closes: authorize a signature while reviewing a tax form,
  // then queue assembly against a personal-guarantee form in the same program.
  const body = fn('queueProviderOnboardingFormAssembly');
  assert.match(body, /if\(authorization\.data\.template_id!==template\.data\.id\)\{\s*\n\s*throw new Error\('Signature authorization was granted for a different form template\.'\);/);
  assert.match(body, /if\(authorization\.data\.template_sha256!==template\.data\.template_sha256\)\{\s*\n\s*throw new Error\('Form template changed after signature consent was granted\.'\);/);
});

test('the same binding is re-checked at assembly time, not only at queue time', () => {
  // A template can be re-cut between queueing and processing.
  const body = fn('processProviderOnboardingFormAssembly');
  assert.match(body, /authorization\.data\.template_id!==template\.data\.id/);
  assert.match(body, /authorization\.data\.template_sha256!==template\.data\.template_sha256/);
});

test('revocation is security definer, service_role only, and takes an explicit actor', () => {
  assert.match(migration, /language plpgsql\s+security definer\s+set search_path = public, pg_temp/);
  assert.match(migration, /revoke all on function public\.provider_onboarding_revoke_signature_authorization\(uuid,uuid,text,text\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.provider_onboarding_revoke_signature_authorization\(uuid,uuid,text,text\) to service_role;/);
  assert.ok(!/current_user|session_user/.test(migration));
});

test('revocation requires an actor and a reason and is idempotent', () => {
  assert.match(migration, /Signature revocation requires an identified actor\./);
  assert.match(migration, /Signature revocation requires a reason code\./);
  assert.match(migration, /if authorization_row\.authorization_status = 'revoked' then\s+return jsonb_build_object\([^)]*'idempotent_replay',true\)/);
});

test('a consumed authorization cannot be revoked', () => {
  // The signed artifact already exists; revoking would misrepresent history.
  assert.match(migration, /if authorization_row\.authorization_status = 'consumed' then/);
  assert.match(migration, /A consumed signature authorization cannot be revoked; revoke the release package instead\./);
});

test('revocation is recorded against any assembly that referenced the consent', () => {
  assert.match(migration, /insert into public\.provider_onboarding_form_assembly_events/);
  assert.match(migration, /'signature_authorization_revoked'/);
  assert.match(migration, /where a\.organization_id=p_organization_id\s+and a\.signature_authorization_id=p_authorization_id;/);
});
