import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIFIER_PROMPT_VERSION, REQUEST_TYPES,
  classifyDeterministically, classifyOnboardingRequest,
} from '../supabase/functions/_shared/provider-agent-classifier.mjs';

// Synthetic fixtures only. No real provider, mailbox, identifier or document appears.
const EMAIL = {
  subject: 'New customer setup - please complete attached packet',
  body_text: 'Hello,\n\nPlease complete the attached vendor packet and return it with your W-9 and a bank letter by Friday.\n\nRegards,\nAP Team\n\n--\nCONFIDENTIALITY NOTICE: this message is intended only for...',
  attachment_names: ['vendor packet.pdf'],
};

const MODEL_RESULT = {
  request_type: 'customer_setup',
  confidence: 0.92,
  language: 'en',
  requested_documents: ['W-9', 'bank letter'],
  forms_to_complete: ['vendor packet'],
  deadline_text: 'Friday',
  reasoning: 'The sender asks XBF to complete their packet and return supporting documents.',
};

function openAiFetch(result, { fail = false, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (fail) return { ok: false, status, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }),
    };
  };
  impl.calls = calls;
  return impl;
}

function routedFetch({ openai, anthropic }) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(url);
    if (url.includes('openai.com')) return openai(url, init);
    if (url.includes('anthropic.com')) return anthropic(url, init);
    throw new Error(`unexpected host: ${url}`);
  };
  impl.calls = calls;
  return impl;
}

test('OpenAI is the primary provider and Anthropic is not called when it succeeds', async () => {
  const fetchImpl = routedFetch({
    openai: openAiFetch(MODEL_RESULT),
    anthropic: async () => { throw new Error('anthropic must not be called'); },
  });
  const result = await classifyOnboardingRequest(EMAIL, {
    openaiApiKey: 'test', anthropicApiKey: 'test', fetch: fetchImpl,
  });
  assert.equal(result.engine, 'openai');
  assert.equal(result.request_type, 'customer_setup');
  assert.deepEqual(fetchImpl.calls.filter((url) => url.includes('anthropic')), []);
});

test('Anthropic takes over when OpenAI fails, and the attempt is recorded', async () => {
  const fetchImpl = routedFetch({
    openai: openAiFetch(null, { fail: true, status: 503 }),
    anthropic: async () => ({
      ok: true, status: 200,
      json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(MODEL_RESULT) }] }),
    }),
  });
  const result = await classifyOnboardingRequest(EMAIL, {
    openaiApiKey: 'test', anthropicApiKey: 'test', fetch: fetchImpl,
  });
  assert.equal(result.engine, 'anthropic');
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].engine, 'openai');
  assert.match(result.attempts[0].error, /503/);
});

test('the required Anthropic headers and model are sent', async () => {
  let captured = null;
  const fetchImpl = routedFetch({
    openai: openAiFetch(null, { fail: true }),
    anthropic: async (url, init) => {
      captured = { headers: init.headers, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(MODEL_RESULT) }] }) };
    },
  });
  await classifyOnboardingRequest(EMAIL, { openaiApiKey: 'k', anthropicApiKey: 'a', fetch: fetchImpl });
  assert.equal(captured.headers['x-api-key'], 'a');
  assert.equal(captured.headers['anthropic-version'], '2023-06-01');
  assert.equal(captured.body.model, 'claude-opus-5');
  assert.ok(captured.body.max_tokens > 0, 'max_tokens is required');
  // temperature is rejected on this model; sending it would 400 every request.
  assert.equal(captured.body.temperature, undefined);
});

test('an Anthropic refusal is treated as a failure, not as a classification', async () => {
  const fetchImpl = routedFetch({
    openai: openAiFetch(null, { fail: true }),
    anthropic: async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'refusal', content: [] }) }),
  });
  const result = await classifyOnboardingRequest(EMAIL, {
    openaiApiKey: 'k', anthropicApiKey: 'a', fetch: fetchImpl,
  });
  assert.equal(result.engine, 'deterministic');
  assert.equal(result.attempts.length, 2);
  assert.match(result.attempts[1].error, /declined/i);
});

test('both providers failing degrades to deterministic rather than stalling', async () => {
  const fetchImpl = routedFetch({
    openai: openAiFetch(null, { fail: true }),
    anthropic: async () => { throw new Error('network down'); },
  });
  const result = await classifyOnboardingRequest(EMAIL, {
    openaiApiKey: 'k', anthropicApiKey: 'a', fetch: fetchImpl,
  });
  assert.equal(result.engine, 'deterministic');
  assert.equal(result.request_type, 'customer_setup');
  assert.ok(result.confidence <= 0.4, 'keyword confidence must stay below any auto-accept bar');
});

test('a malformed model response is rejected rather than trusted', async () => {
  for (const bad of [
    { ...MODEL_RESULT, request_type: 'invented_type' },
    { ...MODEL_RESULT, confidence: 7 },
    { ...MODEL_RESULT, confidence: 'high' },
  ]) {
    const fetchImpl = routedFetch({
      openai: openAiFetch(bad),
      anthropic: async () => { throw new Error('down'); },
    });
    const result = await classifyOnboardingRequest(EMAIL, { openaiApiKey: 'k', fetch: fetchImpl });
    assert.equal(result.engine, 'deterministic', `should not trust ${JSON.stringify(bad).slice(0, 40)}`);
  }
});

test('every result is a proposal carrying its audit fields', async () => {
  const fetchImpl = routedFetch({ openai: openAiFetch(MODEL_RESULT), anthropic: async () => { throw new Error('x'); } });
  const result = await classifyOnboardingRequest(EMAIL, { openaiApiKey: 'k', fetch: fetchImpl });
  assert.equal(result.decision, 'proposed', 'the model never decides');
  assert.equal(result.prompt_version, CLASSIFIER_PROMPT_VERSION);
  assert.ok(result.policy_version);
  assert.match(result.context_digest, /^[0-9a-f]{64}$/);
  assert.equal(result.model, 'gpt-4o-2024-11-20');
});

test('the email body never appears in the result — only a digest', async () => {
  const fetchImpl = routedFetch({ openai: openAiFetch(MODEL_RESULT), anthropic: async () => { throw new Error('x'); } });
  const result = await classifyOnboardingRequest(EMAIL, { openaiApiKey: 'k', fetch: fetchImpl });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('CONFIDENTIALITY'), 'body text must not ride along in the result');
  assert.ok(!serialized.includes(EMAIL.body_text));
});

test('a provider error body never reaches the recorded attempt', async () => {
  const fetchImpl = routedFetch({
    // A provider error body can quote the prompt, so only the status is read.
    openai: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: EMAIL.body_text } }) }),
    anthropic: async () => { throw new Error('down'); },
  });
  const result = await classifyOnboardingRequest(EMAIL, { openaiApiKey: 'k', anthropicApiKey: 'a', fetch: fetchImpl });
  assert.ok(!JSON.stringify(result.attempts).includes('CONFIDENTIALITY'));
});

test('the deterministic tier recognizes confirmation and Spanish requests', () => {
  assert.equal(classifyDeterministically({ body_text: 'Your vendor number is 4471, you have been set up.' }).request_type, 'confirmation');
  assert.equal(classifyDeterministically({ body_text: 'Ya quedó dado de alta como proveedor.' }).request_type, 'confirmation');
  assert.equal(classifyDeterministically({ subject: 'Solicitud de crédito' }).request_type, 'credit_application');
  assert.equal(classifyDeterministically({ body_text: 'Favor de enviar su constancia fiscal.' }).request_type, 'document_request');
});

test('the deterministic tier recognizes how Mexican carriers actually phrase an alta', () => {
  // Drawn from a real carrier thread. None of these contain the literal "alta de
  // cliente" the rule originally looked for, and every one of them is the primary
  // business case — a carrier asking XBF to register as their customer.
  const setup = (input) => classifyDeterministically(input).request_type;
  assert.equal(setup({ subject: 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN' }), 'customer_setup');
  assert.equal(setup({ body_text: 'formato que requerimos para poder darlos de alta en nuestro sistema' }), 'customer_setup');
  assert.equal(setup({ body_text: 'Les comparto requisitos para comenzar el alta con GRUPO SALZILLO' }), 'customer_setup');
  assert.equal(setup({ body_text: 'Llenado completo del Formato 3.3 Alta Cliente' }), 'customer_setup');
  // The specific vendor phrasing must still win over the broadened alta patterns.
  assert.equal(setup({ body_text: 'Le enviamos el alta de proveedor para su llenado.' }), 'vendor_packet');
  // And a completed alta is still a confirmation, not a new setup request.
  assert.equal(setup({ body_text: 'Ya quedó dado de alta como proveedor.' }), 'confirmation');
});

test('an unrecognizable email is unrelated at zero confidence, never guessed', () => {
  const result = classifyDeterministically({ subject: 'Lunch?', body_text: 'Are you free Thursday?' });
  assert.equal(result.request_type, 'unrelated');
  assert.equal(result.confidence, 0);
});

test('the request-type vocabulary covers the brief\'s named intents', () => {
  for (const type of ['customer_setup', 'credit_application', 'vendor_packet', 'document_request', 'confirmation', 'information_request']) {
    assert.ok(REQUEST_TYPES.includes(type), `missing ${type}`);
  }
});

test('classification fails loudly if every tier is removed', async () => {
  // Guards against a future refactor silently dropping the deterministic floor.
  const { classifyOnboardingRequest: fresh } = await import('../supabase/functions/_shared/provider-agent-classifier.mjs');
  const result = await fresh(EMAIL, { fetch: async () => { throw new Error('no'); } });
  assert.equal(result.engine, 'deterministic', 'with no keys configured the deterministic tier must still answer');
});
