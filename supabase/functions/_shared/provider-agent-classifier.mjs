// Agent step 2: interpret an inbound onboarding email.
//
// This is the piece that could not be done deterministically — reading free prose,
// in English or Spanish, forwarded or CC'd, and deciding what the carrier is asking
// XBF to do. Provider matching and entity resolution stay in
// provider-agent-resolution.mjs precisely because those ARE evidence problems.
//
// Provider order, per the operator's decision: OpenAI primary, Anthropic fallback,
// deterministic keyword classifier last. The deterministic tier is not decoration —
// it means an outage degrades the agent to low-confidence proposals that a human
// reviews, instead of stalling the queue.
//
// Both providers are called over raw fetch rather than an SDK: this runs in Deno
// edge, needs one uniform result shape across two vendors, and must not carry two
// SDK bundles.
//
// Brief §17: the model may classify and propose. It may not decide. Every result
// returned here is a proposal carrying its engine, prompt version and confidence,
// and the caller gates it. Prompt contents are never stored — only a digest.

export const CLASSIFIER_PROMPT_VERSION = '2026.08.17';
export const CLASSIFIER_POLICY_VERSION = '2026.08.17';

/**
 * Secret names each provider key may be stored under, in preference order.
 *
 * OPENAI_API_KEY_2 comes first deliberately: the original OPENAI_API_KEY was
 * refused with a 403, and the replacement was added alongside it rather than over
 * it, so the working key must win. Both are read so neither has to be deleted.
 *
 * The classifier itself never reads the environment — keys are passed in, which is
 * what keeps it testable. This is the one place that maps env to keys, so the
 * preview endpoint and the Gmail intake cannot drift apart and behave differently.
 */
export const OPENAI_KEY_ENV_NAMES = Object.freeze(['OPENAI_API_KEY_2', 'OPENAI_API_KEY']);
export const ANTHROPIC_KEY_ENV_NAMES = Object.freeze(['ANTHROPIC_API_KEY_2', 'ANTHROPIC_API_KEY']);

function firstEnvValue(env, names) {
  for (const name of names) {
    const value = env?.get?.(name);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Resolves both provider keys from an environment, newest name first. */
export function resolveProviderKeys(env) {
  return {
    openaiApiKey: firstEnvValue(env, OPENAI_KEY_ENV_NAMES),
    anthropicApiKey: firstEnvValue(env, ANTHROPIC_KEY_ENV_NAMES),
  };
}

const OPENAI_MODEL = 'gpt-4o-2024-11-20';
const ANTHROPIC_MODEL = 'claude-opus-5';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_BODY_CHARS = 12000;
const TIMEOUT_MS = 20000;

export const REQUEST_TYPES = Object.freeze([
  'customer_setup',        // carrier asks XBF to register as their customer
  'credit_application',    // credit line / trade references requested
  'vendor_packet',         // generic supplier onboarding packet
  'document_request',      // specific documents requested, no form
  'status_followup',       // chasing an earlier submission
  'confirmation',          // alta completed / vendor number issued
  'information_request',   // provider needs more from XBF
  'unrelated',             // not an onboarding request
]);

const SYSTEM_PROMPT = `You classify inbound email for a freight brokerage's onboarding mailbox.
The brokerage (XBF) is being asked to register AS A CUSTOMER of the carrier or provider who wrote.
Emails arrive in English or Spanish, often forwarded or with the mailbox in copy, and the request is
frequently buried under signatures, legal disclaimers and quoted history.

Return the request type, the documents explicitly requested, whether a form must be completed, any
stated deadline, and your confidence. Report only what the email actually says. Do not infer a
document that is not named. Do not guess a deadline. If the email is a reply confirming registration
was completed, classify it as confirmation. If you cannot tell, use unrelated with low confidence —
a human reviews every low-confidence result, so guessing costs more than abstaining.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    request_type: { type: 'string', enum: [...REQUEST_TYPES] },
    confidence: { type: 'number' },
    language: { type: 'string', enum: ['en', 'es', 'mixed', 'unknown'] },
    requested_documents: { type: 'array', items: { type: 'string' } },
    forms_to_complete: { type: 'array', items: { type: 'string' } },
    deadline_text: { type: ['string', 'null'] },
    reasoning: { type: 'string' },
  },
  required: ['request_type', 'confidence', 'language', 'requested_documents', 'forms_to_complete', 'deadline_text', 'reasoning'],
  additionalProperties: false,
};

const text = (value) => String(value ?? '').trim();

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value ?? '')));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Builds the model input. Bodies are truncated; nothing here is ever persisted. */
function buildUserContent(input) {
  const parts = [
    `Subject: ${text(input.subject)}`,
    `Attachments: ${(input.attachment_names || []).map(text).filter(Boolean).join(', ') || 'none'}`,
    '',
    text(input.body_text).slice(0, MAX_BODY_CHARS),
  ];
  return parts.join('\n');
}

function normalizeResult(raw) {
  const requestType = REQUEST_TYPES.includes(raw?.request_type) ? raw.request_type : null;
  if (!requestType) throw new Error('Model returned an unrecognized request_type.');
  const confidence = Number(raw?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Model returned an invalid confidence.');
  }
  const list = (value) => Object.freeze((Array.isArray(value) ? value : []).map(text).filter(Boolean).slice(0, 40));
  return {
    request_type: requestType,
    confidence,
    language: ['en', 'es', 'mixed', 'unknown'].includes(raw?.language) ? raw.language : 'unknown',
    requested_documents: list(raw?.requested_documents),
    forms_to_complete: list(raw?.forms_to_complete),
    deadline_text: text(raw?.deadline_text) || null,
    reasoning: text(raw?.reasoning).slice(0, 2000),
  };
}

async function postJson(url, headers, body, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      // The status is diagnostic; the response body may quote the email, so it is
      // never read into an error message.
      throw new Error(`Provider responded ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function classifyWithOpenAI(input, { apiKey, fetchImpl }) {
  const payload = await postJson('https://api.openai.com/v1/chat/completions', {
    authorization: `Bearer ${apiKey}`,
  }, {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserContent(input) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'onboarding_request', strict: true, schema: OUTPUT_SCHEMA },
    },
  }, fetchImpl);
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content.');
  return normalizeResult(JSON.parse(content));
}

async function classifyWithAnthropic(input, { apiKey, fetchImpl }) {
  const payload = await postJson('https://api.anthropic.com/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  }, {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: buildUserContent(input) }],
  }, fetchImpl);
  // A refused request returns HTTP 200 with an empty or partial content array.
  if (payload?.stop_reason === 'refusal') throw new Error('Anthropic declined the request.');
  const block = (payload?.content || []).find((item) => item?.type === 'text');
  if (!block?.text) throw new Error('Anthropic returned no content.');
  return normalizeResult(JSON.parse(block.text));
}

// Deterministic last resort. Deliberately capped at 0.4 — below any sane auto-accept
// threshold — because keyword matching cannot read a forwarded chain.
const KEYWORD_RULES = [
  [/vendor (number|code) (is|:)|has been (set up|registered)|alta (completada|realizada)|ya (quedó|quedo) dado de alta/i, 'confirmation'],
  [/credit (application|line|reference)|solicitud de cr[eé]dito|l[ií]nea de cr[eé]dito/i, 'credit_application'],
  // Only this one specific Spanish phrase is hoisted above customer_setup: it names
  // the opposite direction explicitly, so it must beat the broader alta patterns
  // below. The English vendor rule stays after customer_setup, where a subject like
  // "New customer setup ... attached vendor packet" still reads as a customer setup.
  [/alta de proveedor/i, 'vendor_packet'],
  // Mexican carriers phrase client registration many ways, and a real thread from
  // one showed the previous rule missing all of them: the subject read "PROCESO DE
  // ALTA", the body "para poder darlos de alta en nuestro sistema", and the attached
  // form "Formato 3.3 Alta Cliente" — no "alta de cliente" anywhere. It fell through
  // to document_request on "Favor de enviar", which is the wrong case entirely.
  [/customer setup|new customer|set ?up (form|packet)|alta\s+(?:de\s+)?cliente|registro de cliente|dar(?:los|nos|les|le)?\s+de\s+alta|proceso\s+de\s+alta|alta\s+con\s/i, 'customer_setup'],
  [/vendor (packet|onboarding|registration)|supplier onboarding/i, 'vendor_packet'],
  [/please (send|provide|attach)|favor de (enviar|proporcionar)|we (need|require) (your|the)/i, 'document_request'],
  [/follow(ing)? up|any update|seguimiento|alguna actualizaci[oó]n/i, 'status_followup'],
];

export function classifyDeterministically(input) {
  const haystack = `${text(input?.subject)} \n ${text(input?.body_text)}`;
  for (const [pattern, requestType] of KEYWORD_RULES) {
    if (pattern.test(haystack)) {
      return normalizeResult({
        request_type: requestType,
        confidence: 0.4,
        language: /[áéíóúñ¿¡]/i.test(haystack) ? 'es' : 'en',
        requested_documents: [],
        forms_to_complete: [],
        deadline_text: null,
        reasoning: 'Keyword fallback; no model was available.',
      });
    }
  }
  return normalizeResult({
    request_type: 'unrelated',
    confidence: 0,
    language: 'unknown',
    requested_documents: [],
    forms_to_complete: [],
    deadline_text: null,
    reasoning: 'Keyword fallback matched nothing.',
  });
}

/**
 * Classifies an inbound onboarding email.
 *
 * Tries OpenAI, then Anthropic, then deterministic keywords. Returns a proposal —
 * never a decision — with the audit fields §17 requires. The result carries a
 * context digest rather than the email, so no body text reaches an event or a log.
 */
export async function classifyOnboardingRequest(input = {}, options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const contextDigest = await sha256Hex(buildUserContent(input));
  const attempts = [];

  const tiers = [
    options.openaiApiKey ? ['openai', OPENAI_MODEL, () => classifyWithOpenAI(input, { apiKey: options.openaiApiKey, fetchImpl })] : null,
    options.anthropicApiKey ? ['anthropic', ANTHROPIC_MODEL, () => classifyWithAnthropic(input, { apiKey: options.anthropicApiKey, fetchImpl })] : null,
    ['deterministic', `keywords@${CLASSIFIER_PROMPT_VERSION}`, async () => classifyDeterministically(input)],
  ].filter(Boolean);

  for (const [engine, model, run] of tiers) {
    try {
      const result = await run();
      return Object.freeze({
        ...result,
        requested_documents: result.requested_documents,
        forms_to_complete: result.forms_to_complete,
        engine,
        model,
        prompt_version: CLASSIFIER_PROMPT_VERSION,
        policy_version: CLASSIFIER_POLICY_VERSION,
        context_digest: contextDigest,
        attempts: Object.freeze([...attempts]),
        // The agent proposes; a human or a deterministic gate decides.
        decision: 'proposed',
      });
    } catch (error) {
      attempts.push(Object.freeze({
        engine,
        model,
        // Message only — provider error bodies can quote the email.
        error: text(error?.message).slice(0, 200) || 'unknown_error',
      }));
    }
  }
  throw new Error('All classification tiers failed.');
}
