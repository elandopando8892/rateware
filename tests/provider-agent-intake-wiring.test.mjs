import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProviderKeys } from '../supabase/functions/_shared/provider-agent-classifier.mjs';

const sync = readFileSync(new URL('../supabase/functions/_shared/provider-gmail-sync.ts', import.meta.url), 'utf8');
const intake = readFileSync(new URL('../supabase/functions/_shared/provider-agent-intake.ts', import.meta.url), 'utf8');
const validator = readFileSync(new URL('../tools/validate-provider-service-runtime-syntax.mjs', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260817140000_provider_agent_model_assisted_runtime.sql', import.meta.url), 'utf8');

test('Gmail sync actually calls the agent intake', () => {
  // Sprint 1 exists because every agent module was unreachable. This is the assertion
  // that would have caught it.
  assert.match(sync, /import \{ runProviderOnboardingIntake \} from '\.\/provider-agent-intake\.ts';/);
  assert.match(sync, /await runProviderOnboardingIntake\(supabase, \{/);
});

test('intake runs on inbound messages only, and only on first insert', () => {
  // Re-running intake on a duplicate would double-count and re-bill the classifier.
  assert.match(sync, /if \(outcome\.inserted\) \{[\s\S]*?if \(message\.direction === 'inbound'\) \{/);
});

test('a failed intake does not fail the sync', () => {
  // The message is already stored; losing the sync would strand every later message.
  assert.match(sync, /\} catch \(_error\) \{\s*\n\s*intakeFailureCount \+= 1;/);
  assert.match(sync, /intake_failure_count: intakeFailureCount/);
});

test('the composed intake calls all three resolution steps', () => {
  assert.match(intake, /await resolveProviderThread\(/);
  assert.match(intake, /await classifyOnboardingRequest\(/);
  assert.match(intake, /resolveXbfEntity\(/);
});

test('the agent proposes and never selects on ambiguity', () => {
  assert.match(intake, /decision: 'proposed'/);
  assert.match(intake, /requires_human_entity_selection: entity\.requires_human_selection/);
  assert.match(intake, /requires_human_provider_selection: match\.decision !== 'matched'/);
  // A relationship is recorded only on an unambiguous match.
  assert.match(intake, /provider_relationship_id: match\.decision === 'matched' \? match\.provider_relationship_id : null/);
});

test('the run records the audit fields section 17 requires', () => {
  for (const field of ['engine', 'model', 'prompt_version', 'policy_version', 'context_digest']) {
    assert.match(intake, new RegExp(`${field}:`), `missing ${field}`);
  }
  assert.match(intake, /run_mode: 'intake'/);
  assert.match(intake, /runtime_type: 'model_assisted'/);
});

test('no message content is written to the agent run', () => {
  const metadata = intake.slice(intake.indexOf('metadata: {'), intake.indexOf('}).eq(\'organization_id\', organizationId).eq(\'id\', runId)'));
  for (const leak of ['body_text', 'bodyText', 'subject', 'senderEmail', 'requested_documents:', 'reasoning']) {
    assert.ok(!metadata.includes(leak), `${leak} must not be persisted on the run`);
  }
  // Counts and the digest stand in for the content.
  assert.match(metadata, /requested_document_count/);
  assert.match(metadata, /context_digest/);
});

test('provider API keys come from the environment, never from a caller', () => {
  // Executed rather than grepped: the resolver is shared by the intake and the
  // preview endpoint, so this pins the actual behaviour both depend on.
  const env = (values) => ({ get: (name) => values[name] });
  assert.deepEqual(
    resolveProviderKeys(env({ OPENAI_API_KEY: 'openai-key', ANTHROPIC_API_KEY: 'anthropic-key' })),
    { openaiApiKey: 'openai-key', anthropicApiKey: 'anthropic-key' },
  );
  // An absent key stays undefined so the tier is skipped, never sent empty.
  assert.deepEqual(resolveProviderKeys(env({})), { openaiApiKey: undefined, anthropicApiKey: undefined });
  assert.deepEqual(resolveProviderKeys(env({ OPENAI_API_KEY: '   ' })).openaiApiKey, undefined);
  assert.deepEqual(resolveProviderKeys(undefined), { openaiApiKey: undefined, anthropicApiKey: undefined });
  // The replacement key wins: the original OPENAI_API_KEY was refused with a 403
  // and the working one was added alongside rather than over it.
  assert.equal(
    resolveProviderKeys(env({ OPENAI_API_KEY: 'refused', OPENAI_API_KEY_2: 'working' })).openaiApiKey,
    'working',
  );
  // And the intake still never takes a key off the request.
  assert.ok(!/apiKey:\s*input\./.test(intake), 'keys must never be read from the request');
});

test('Reply-To is captured as a matching signal', () => {
  assert.match(sync, /replyToEmail: parseAddresses\(headerValue\(payload, 'Reply-To'\)\)\[0\] \|\| null/);
});

test('model_assisted is a valid runtime type', () => {
  // Recording an LLM-backed run as 'deterministic' would claim no model was involved.
  assert.match(migration, /check \(runtime_type in \('deterministic', 'model_assisted', 'openai_agents_sdk'\)\)/);
  assert.match(migration, /drop constraint if exists provider_agent_runs_runtime_check/);
});

test('every agent module is covered by the runtime syntax gate', () => {
  for (const module of [
    'provider-agent-resolution.mjs',
    'provider-agent-thread-resolution.ts',
    'provider-agent-classifier.mjs',
    'provider-agent-intake.ts',
    'provider-onboarding-ontology.mjs',
    'provider-onboarding-form-adapters.mjs',
    'provider-onboarding-assembler.mjs',
    'provider-entity-import.mjs',
  ]) {
    assert.ok(validator.includes(module), `${module} is not syntax-gated`);
  }
});

test('an operator directive outranks the model, and the run says so', () => {
  // The live mailbox showed the model calling "a carrier registered with us"
  // customer_setup at 0.95. An operator forwarding the email knows the direction,
  // so a trusted directive decides the type — and the audit records which decided.
  assert.match(intake, /const directive = detectOperatorDirective\(/);
  assert.match(intake, /directive\.honored && directive\.request_type/);
  assert.match(intake, /request_type: effectiveRequestType/);
  // The model's own answer is kept, so a disagreement stays visible.
  assert.match(intake, /request_type_source: directive\.honored \? 'operator_directive' : 'classifier'/);
  assert.match(intake, /model_request_type: classification\.request_type/);
  // A refused directive is recorded rather than dropped.
  assert.match(intake, /directive_refused_reason: directive\.reason/);
});

test('the directive is scoped to trusted senders at the call site', () => {
  // The security property lives in the module, but the intake must actually pass
  // the trust set — omitting it would honour any sender.
  assert.match(intake, /trusted_domains: trustedDirectiveDomains\(\{/);
  assert.match(intake, /mailboxEmail: input\.mailbox_reference/);
});
