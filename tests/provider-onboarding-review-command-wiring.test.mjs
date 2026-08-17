import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/shipper-directory-api/provider-service.ts', import.meta.url), 'utf8');
const COMMANDS = [
  'claim_provider_entity_document_review',
  'decide_provider_entity_review_field',
  'finalize_provider_entity_document_review',
];

test('the review command module is actually imported by an entrypoint', () => {
  // Builds 22-29 wrote these command modules but nothing imported them, so the
  // logic was unreachable over HTTP. This asserts the wiring exists.
  assert.match(source, /import \{\s*claimProviderEntityDocumentReview,\s*decideProviderEntityReviewField,\s*finalizeProviderEntityDocumentReview,\s*\} from "\.\.\/_shared\/provider-entity-review-commands\.ts";/);
});

test('every review command is registered and routed', () => {
  for (const action of COMMANDS) {
    assert.match(source, new RegExp(`"${action}",`), `${action} is not registered`);
  }
  const commandSet = source.slice(source.indexOf('const PROVIDER_SERVICE_COMMANDS'), source.indexOf('const COMMAND_CENTER_QUEUES'));
  for (const action of COMMANDS) {
    assert.ok(commandSet.includes(action), `${action} is not marked as a command`);
  }
});

test('commands require an identified user', () => {
  assert.match(source, /const reviewerUserId = cleanText\(user\.owner_user_id\);/);
  assert.match(source, /if \(!reviewerUserId\) throw new Error\("Provider Service commands require an identified user\."\);/);
});

test('the resolved tenant overwrites any caller-supplied organization id', () => {
  // The shared command modules read organization_id from their input, so a merge
  // in the wrong order would let the browser choose the tenant.
  assert.match(source, /const input = \{ \.\.\.body, organization_id: organizationUuid \};/);
  const handler = source.slice(source.indexOf('if (PROVIDER_SERVICE_COMMANDS.has(action))'), source.indexOf('if (action === "list_provider_service_command_center")'));
  assert.ok(!/organization_id: cleanText\(body/.test(handler));
  assert.ok(!/\{ organization_id: organizationUuid, \.\.\.body \}/.test(handler), 'spreading body last would let the caller override the tenant');
});

test('commands are dispatched before the read handlers and never fall through', () => {
  const commandBlock = source.indexOf('if (PROVIDER_SERVICE_COMMANDS.has(action))');
  const firstRead = source.indexOf('if (action === "list_provider_service_command_center")');
  assert.ok(commandBlock > 0 && commandBlock < firstRead, 'commands must be handled before read dispatch');
  // The block returns for all three commands, so no command can reach getProvider360.
  const block = source.slice(commandBlock, firstRead);
  assert.equal((block.match(/return \{ data: await /g) || []).length, 3);
});

test('the reviewer identity comes from the authenticated user, not the request body', () => {
  const handler = source.slice(source.indexOf('if (PROVIDER_SERVICE_COMMANDS.has(action))'), source.indexOf('if (action === "list_provider_service_command_center")'));
  assert.ok(!/body\.reviewer_user_id|body\.actor/.test(handler), 'the actor must never come from the request body');
  assert.equal((handler.match(/, reviewerUserId\)/g) || []).length, 3, 'every command must receive the authenticated reviewer');
});
