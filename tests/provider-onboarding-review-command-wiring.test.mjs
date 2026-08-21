import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/provider-onboarding-api/provider-service.ts', import.meta.url), 'utf8');
const COMMANDS = [
  'claim_provider_entity_document_review',
  'decide_provider_entity_review_field',
  'finalize_provider_entity_document_review',
  'promote_provider_entity_review_facts',
  'open_provider_onboarding_case',
  'reconcile_provider_onboarding_case',
  'cancel_provider_onboarding_case',
  'create_provider_onboarding_release_package',
  'begin_provider_entity_upload',
  'confirm_provider_entity_upload',
];

test('the review command module is actually imported by an entrypoint', () => {
  // Builds 22-29 wrote these command modules but nothing imported them, so the
  // logic was unreachable over HTTP. This asserts the wiring exists.
  assert.match(source, /import \{\s*claimProviderEntityDocumentReview,\s*decideProviderEntityReviewField,\s*finalizeProviderEntityDocumentReview,\s*\} from "\.\.\/_shared\/provider-entity-review-commands\.ts";/);
});

test('every wired command is registered and routed', () => {
  for (const action of COMMANDS) {
    assert.match(source, new RegExp(`"${action}",`), `${action} is not registered`);
  }
  const commandMap = source.slice(source.indexOf('const PROVIDER_SERVICE_COMMANDS'), source.indexOf('const COMMAND_CENTER_QUEUES'));
  for (const action of COMMANDS) {
    assert.ok(commandMap.includes(`["${action}"`), `${action} is not in the command map`);
  }
});

test('commands that reach external systems stay unreachable', () => {
  // Form assembly and Gmail delivery produce outbound side effects. They remain
  // unwired until a sender allowlist and recipient-domain policy exist, so there
  // is no HTTP path to an external action that has not been authorized.
  assert.ok(!/from "\.\.\/_shared\/provider-onboarding-form-assembly\.ts"/.test(source));
  assert.ok(!/from "\.\.\/_shared\/provider-onboarding-gmail-delivery\.ts"/.test(source));
  for (const action of ['queue_provider_onboarding_form_assembly', 'send_provider_onboarding_message']) {
    assert.ok(!source.includes(`"${action}"`), `${action} must not be reachable yet`);
  }
});

test('the duplicate release-package decision command is not wired', () => {
  // decideProviderOnboardingReleasePackage counts approvals across every revision,
  // so a re-cut package would inherit approvals granted for different contents.
  // provider_onboarding_decide_release_package_approval is canonical.
  assert.ok(!/\bdecideProviderOnboardingReleasePackage\b(?![^\n]*—)/.test(source.replace(/\/\/[^\n]*/g, '')), 'the duplicate decision command must not be imported or dispatched');
  assert.match(source, /createProviderOnboardingReleasePackage/, 'package creation is still wired');
});

const dispatch = source.slice(
  source.indexOf('const command = PROVIDER_SERVICE_COMMANDS.get('),
  source.indexOf('if (action === "list_provider_service_command_center")'),
);

test('commands require an identified user', () => {
  assert.match(source, /const actorId = cleanText\(user\.owner_user_id\);/);
  assert.match(source, /if \(!actorId\) throw unauthorized\("Provider Service commands require an identified user\."\);/);
});

test('the resolved tenant overwrites any caller-supplied organization id', () => {
  // The shared command modules read organization_id from their input, so a merge
  // in the wrong order would let the browser choose the tenant.
  assert.match(dispatch, /const input = \{ \.\.\.body, organization_id: organizationUuid \};/);
  assert.ok(!/\{ organization_id: organizationUuid, \.\.\.body \}/.test(dispatch), 'spreading body last would let the caller override the tenant');
});

test('commands are dispatched before the read handlers and never fall through', () => {
  const commandBlock = source.indexOf('const command = PROVIDER_SERVICE_COMMANDS.get(');
  const firstRead = source.indexOf('if (action === "list_provider_service_command_center")');
  assert.ok(commandBlock > 0 && commandBlock < firstRead, 'commands must be handled before read dispatch');
  // A single guarded return covers every command, so none can reach getProvider360.
  assert.match(dispatch, /if \(command\) \{[\s\S]*return \{ data: await command\(supabase, input, actorId\) \};[\s\S]*\}/);
});

test('the actor identity comes from the authenticated user, not the request body', () => {
  assert.ok(!/body\.reviewer_user_id|body\.actor/.test(dispatch), 'the actor must never come from the request body');
  assert.match(dispatch, /command\(supabase, input, actorId\)/);
});

test('the bounded-upload adapter pins the actor type to user', () => {
  // The module accepts actor.type of user | agent | system | integration, and only
  // 'user' requires an identified id. Taking the type from the request would let a
  // browser caller claim to be the system and upload without an identity.
  const map = source.slice(source.indexOf('const PROVIDER_SERVICE_COMMANDS'), source.indexOf('const COMMAND_CENTER_QUEUES'));
  assert.equal((map.match(/\{ type: "user", userId: actorId \}/g) || []).length, 2);
  assert.ok(!/type: cleanText\(body|type: body\./.test(map), 'the actor type must never come from the request');
});

test('the command table is the only route into a command module', () => {
  // A per-action if-chain drifts; a table cannot dispatch something absent from it.
  assert.match(source, /const PROVIDER_SERVICE_COMMANDS = new Map</);
  assert.equal((dispatch.match(/await command\(/g) || []).length, 1, 'exactly one dispatch site');
});
