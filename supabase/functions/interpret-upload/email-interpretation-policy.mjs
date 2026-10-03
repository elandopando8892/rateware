// Pure policy for bounded EML interpretation in interpret-upload.
// No network, env or Deno access: the caller injects fetch and the default model.

export const EMAIL_INTERPRETATION_MODEL = "gpt-6-luna";
export const EMAIL_REASONING_EFFORT = "none";
export const EMAIL_MAX_OUTPUT_TOKENS = 16384;
export const EMAIL_SERVICE_TIER = "default";
export const EMAIL_MAX_REQUEST_BYTES = 131072;

// Standard list price (USD per million tokens), reviewed 2026-10-02. Not a contractual cap.
const INPUT_USD_PER_MILLION = 0.10;
const OUTPUT_USD_PER_MILLION = 0.50;

const encoder = new TextEncoder();

export function isEmailDocument(documentType) {
  return documentType === "email";
}

// The model never comes from the client: email is pinned, the rest keep the configured one.
export function selectInterpretationModel(documentType, defaultModel) {
  return isEmailDocument(documentType) ? EMAIL_INTERPRETATION_MODEL : defaultModel;
}

export function utf8ByteLength(text) {
  return encoder.encode(text).length;
}

// Conservative list-price estimate: request bytes as an upper bound of input tokens plus max output.
export function estimateEmailCostUsd(requestBytes) {
  return (requestBytes * INPUT_USD_PER_MILLION + EMAIL_MAX_OUTPUT_TOKENS * OUTPUT_USD_PER_MILLION) / 1_000_000;
}

function assertEmailContent(userContent) {
  if (!Array.isArray(userContent) || userContent.length === 0) {
    throw new Error("Email interpretation requires text content.");
  }
  for (const item of userContent) {
    if (!item || item.type !== "input_text" || typeof item.text !== "string") {
      throw new Error("Email interpretation only accepts text content.");
    }
  }
  const emailText = userContent[userContent.length - 1].text;
  if (!emailText.trim()) throw new Error("Email has no readable text to interpret.");
}

// Non-email keeps today's body exactly (no reasoning, output cap or tier fields).
export function buildInterpretationRequestBody({ documentType, defaultModel, systemPrompt, userContent, schema }) {
  const body = {
    model: selectInterpretationModel(documentType, defaultModel),
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: userContent }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "rateware_interpretation",
        strict: true,
        schema
      }
    }
  };
  if (!isEmailDocument(documentType)) return body;

  assertEmailContent(userContent);
  return {
    ...body,
    reasoning: { effort: EMAIL_REASONING_EFFORT },
    max_output_tokens: EMAIL_MAX_OUTPUT_TOKENS,
    service_tier: EMAIL_SERVICE_TIER
  };
}

// Serializes and enforces the whole-body limit. Never truncates; throws before any fetch.
export function serializeEmailRequestBody(body) {
  const serialized = JSON.stringify(body);
  const bytes = utf8ByteLength(serialized);
  if (bytes > EMAIL_MAX_REQUEST_BYTES) {
    throw new Error(`Email is too large to interpret (limit ${EMAIL_MAX_REQUEST_BYTES} bytes per request). The original file is kept; nothing was truncated.`);
  }
  return { serialized, bytes };
}

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function sanitizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const clean = {
    input_tokens: tokenCount(usage.input_tokens),
    output_tokens: tokenCount(usage.output_tokens),
    total_tokens: tokenCount(usage.total_tokens)
  };
  return Object.values(clean).every((value) => value === null) ? null : clean;
}

function sanitizeModelName(model) {
  return typeof model === "string" && model.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(model) ? model : null;
}

// Only the effective model and token counts survive; nothing else from the payload.
export function emailInterpretationMetadata(payload, requestedModel = EMAIL_INTERPRETATION_MODEL) {
  return {
    requested_model: requestedModel,
    model: sanitizeModelName(payload?.model),
    usage: sanitizeUsage(payload?.usage),
    cost_basis: "unknown_not_billed_amount"
  };
}

function outputContents(payload) {
  const items = Array.isArray(payload.output) ? payload.output : [];
  return items.flatMap((item) => (item && item.type === "refusal" ? [item] : Array.isArray(item?.content) ? item.content : []));
}

// Accepts only a completed response with valid structured output. Errors never carry the payload.
export function parseEmailInterpretationResponse(payload, requestedModel = EMAIL_INTERPRETATION_MODEL) {
  if (!payload || typeof payload !== "object") throw new Error("OpenAI returned an invalid email interpretation response.");
  if (payload.status !== "completed") throw new Error("OpenAI email interpretation did not complete; nothing was saved.");
  if (payload.incomplete_details) throw new Error("OpenAI email interpretation was incomplete; nothing was saved.");

  const contents = outputContents(payload);
  if (contents.some((content) => content && (content.type === "refusal" || typeof content.refusal === "string"))) {
    throw new Error("OpenAI declined the email interpretation; nothing was saved.");
  }

  const outputText = typeof payload.output_text === "string"
    ? payload.output_text
    : contents.find((content) => content?.type === "output_text")?.text;
  if (typeof outputText !== "string" || !outputText.trim()) {
    throw new Error("OpenAI returned no structured interpretation.");
  }

  let interpretation;
  try {
    interpretation = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI returned an invalid structured interpretation.");
  }
  if (!interpretation || typeof interpretation !== "object" || Array.isArray(interpretation) || !Array.isArray(interpretation.rows)) {
    throw new Error("OpenAI returned an invalid structured interpretation.");
  }
  return { interpretation, metadata: emailInterpretationMetadata(payload, requestedModel) };
}

// Exactly one call: no retry, no fallback. onHttpError builds the (sanitized) error message.
export async function runEmailInterpretation({ fetchImpl, body, onHttpError }) {
  const { serialized } = serializeEmailRequestBody(body);
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serialized
  });
  if (!response.ok) {
    throw new Error(onHttpError ? await onHttpError(response) : "OpenAI interpretation failed");
  }
  return parseEmailInterpretationResponse(await response.json(), body.model);
}
