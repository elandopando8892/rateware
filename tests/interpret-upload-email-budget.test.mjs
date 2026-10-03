import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  EMAIL_MAX_OUTPUT_TOKENS,
  EMAIL_MAX_REQUEST_BYTES,
  buildInterpretationRequestBody,
  estimateEmailCostUsd,
  parseEmailInterpretationResponse,
  runEmailInterpretation,
  sanitizeUsage,
  selectInterpretationModel,
  serializeEmailRequestBody,
  utf8ByteLength
} from "../supabase/functions/interpret-upload/email-interpretation-policy.mjs";

const SCHEMA = { type: "object", properties: { rows: { type: "array" } } };
const text = (value) => [{ type: "input_text", text: "meta" }, { type: "input_text", text: value }];
const emailBody = (value = "Monterrey-Dallas 800 USD") => buildInterpretationRequestBody({
  documentType: "email", defaultModel: "global-model", systemPrompt: "rules", userContent: text(value), schema: SCHEMA
});
const completed = (extra = {}) => ({
  status: "completed",
  model: "gpt-6-luna-2026",
  output_text: JSON.stringify({ rows: [{ origin: "Monterrey" }] }),
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  ...extra
});

test("model comes from document type, never the client", () => {
  assert.equal(selectInterpretationModel("email", "global-model"), "gpt-6-luna");
  for (const type of ["pdf", "image", "xlsx", undefined]) {
    assert.equal(selectInterpretationModel(type, "global-model"), "global-model");
  }
});

test("email body pins model, effort none, output cap and standard tier", () => {
  const body = emailBody();
  assert.equal(body.model, "gpt-6-luna");
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal(body.max_output_tokens, 16384);
  assert.equal(body.service_tier, "default");
  assert.equal(body.text.format.schema, SCHEMA);
});

test("non-email body keeps current shape without new fields", () => {
  const userContent = [{ type: "input_file", file_id: "f1" }];
  const body = buildInterpretationRequestBody({
    documentType: "pdf", defaultModel: "global-model", systemPrompt: "rules", userContent, schema: SCHEMA
  });
  assert.deepEqual(Object.keys(body), ["model", "input", "text"]);
  assert.equal(body.model, "global-model");
  assert.equal("reasoning" in body, false);
  assert.equal("max_output_tokens" in body, false);
  assert.equal("service_tier" in body, false);
});

test("email rejects non input_text content and empty text", () => {
  const base = { documentType: "email", defaultModel: "m", systemPrompt: "r", schema: SCHEMA };
  assert.throws(() => buildInterpretationRequestBody({ ...base, userContent: [{ type: "input_file", file_id: "f" }] }), /only accepts text/);
  assert.throws(() => buildInterpretationRequestBody({ ...base, userContent: text("   ") }), /no readable text/);
  assert.throws(() => buildInterpretationRequestBody({ ...base, userContent: [] }), /requires text/);
});

test("limit counts UTF-8 bytes of the whole body, multibyte included", () => {
  const overhead = utf8ByteLength(JSON.stringify(emailBody("x"))) - 1;
  const fill = EMAIL_MAX_REQUEST_BYTES - overhead;
  assert.equal(serializeEmailRequestBody(emailBody("a".repeat(fill))).bytes, EMAIL_MAX_REQUEST_BYTES);
  assert.throws(() => serializeEmailRequestBody(emailBody("a".repeat(fill + 1))), /too large/);
  // 3-byte characters: the character count is under the limit, the byte count is not.
  const chars = Math.floor(fill / 3) + 1;
  assert.ok(chars < EMAIL_MAX_REQUEST_BYTES);
  assert.throws(() => serializeEmailRequestBody(emailBody("€".repeat(chars))), /too large/);
});

test("system prompt and schema count toward the limit", () => {
  const promptBody = buildInterpretationRequestBody({
    documentType: "email", defaultModel: "m", systemPrompt: "x".repeat(EMAIL_MAX_REQUEST_BYTES), userContent: text("hi"), schema: SCHEMA
  });
  assert.throws(() => serializeEmailRequestBody(promptBody), /too large/);
  const schemaBody = buildInterpretationRequestBody({
    documentType: "email", defaultModel: "m", systemPrompt: "r", userContent: text("hi"),
    schema: { type: "object", description: "y".repeat(EMAIL_MAX_REQUEST_BYTES) }
  });
  assert.throws(() => serializeEmailRequestBody(schemaBody), /too large/);
});

test("oversized email is rejected before fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => completed() }; };
  await assert.rejects(runEmailInterpretation({ fetchImpl, body: emailBody("a".repeat(EMAIL_MAX_REQUEST_BYTES)) }), /too large/);
  assert.equal(calls, 0);
});

test("estimate stays near USD 0.022 at the limit", () => {
  const cost = estimateEmailCostUsd(EMAIL_MAX_REQUEST_BYTES);
  assert.ok(cost > 0.021 && cost < 0.023, String(cost));
  assert.equal(EMAIL_MAX_OUTPUT_TOKENS, 16384);
});

test("completed response yields interpretation and sanitized metadata", () => {
  const { interpretation, metadata } = parseEmailInterpretationResponse(completed({ ignored_field: "dropped-value", id: "resp_1" }));
  assert.equal(interpretation.rows.length, 1);
  assert.deepEqual(metadata, {
    requested_model: "gpt-6-luna",
    model: "gpt-6-luna-2026",
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    cost_basis: "unknown_not_billed_amount"
  });
  assert.equal(JSON.stringify(metadata).includes("dropped-value"), false);
});

test("output_text can come from output content", () => {
  const payload = completed({ output_text: undefined, output: [{ content: [{ type: "output_text", text: "{\"rows\":[]}" }] }] });
  assert.deepEqual(parseEmailInterpretationResponse(payload).interpretation, { rows: [] });
});

test("incomplete, failed, cancelled and detailed-incomplete are rejected even if parseable", () => {
  for (const status of ["incomplete", "failed", "cancelled", "in_progress", undefined]) {
    assert.throws(() => parseEmailInterpretationResponse(completed({ status })), /did not complete/);
  }
  assert.throws(() => parseEmailInterpretationResponse(completed({ incomplete_details: { reason: "max_output_tokens" } })), /incomplete/);
});

test("refusal is rejected without leaking payload", () => {
  const payload = completed({ output: [{ content: [{ type: "refusal", refusal: "refusal-detail-text" }] }] });
  assert.throws(() => parseEmailInterpretationResponse(payload), (error) => /declined/.test(error.message) && !error.message.includes("refusal-detail-text"));
});

test("missing or invalid structured output is rejected", () => {
  for (const output_text of [undefined, "", "   ", "{not json", "[]", "{\"summary\":{}}"]) {
    assert.throws(() => parseEmailInterpretationResponse(completed({ output_text })));
  }
  assert.throws(() => parseEmailInterpretationResponse(null));
});

test("usage is sanitized and unknown when absent or invalid", () => {
  assert.equal(sanitizeUsage(undefined), null);
  assert.equal(sanitizeUsage({ input_tokens: -1, output_tokens: 1.5, total_tokens: "9" }), null);
  assert.deepEqual(sanitizeUsage({ input_tokens: 7, output_tokens: -1, total_tokens: 9, ignored_field: "x" }),
    { input_tokens: 7, output_tokens: null, total_tokens: 9 });
  const { metadata } = parseEmailInterpretationResponse(completed({ usage: undefined, model: "bad model!" }));
  assert.equal(metadata.usage, null);
  assert.equal(metadata.model, null);
});

test("HTTP 429 and 500 cause exactly one fetch, no retry or fallback", async () => {
  for (const status of [429, 500]) {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: false, status }; };
    await assert.rejects(
      runEmailInterpretation({ fetchImpl, body: emailBody(), onHttpError: async (r) => `http ${r.status}` }),
      new RegExp(`http ${status}`)
    );
    assert.equal(calls, 1);
  }
});

test("successful run sends one request with the bounded body", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => completed() }; };
  const result = await runEmailInterpretation({ fetchImpl, body: emailBody() });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.openai.com/v1/responses");
  assert.equal(JSON.parse(seen[0].init.body).model, "gpt-6-luna");
  assert.equal(result.metadata.requested_model, "gpt-6-luna");
});

// Execute the actual production request function with an injected, local transport.
// Remove only its TypeScript annotations; do not copy its implementation.
function productionRequest(fetchImpl) {
  const source = readFileSync(new URL("../supabase/functions/interpret-upload/index.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function requestRatewareInterpretation(");
  const end = source.indexOf("function shouldAuditSparseInterpretation(", start);
  assert.ok(start >= 0 && end > start);
  const javascript = source.slice(start, end)
    .replace("systemPrompt: string, userContent: Record<string, unknown>[], documentType?: string", "systemPrompt, userContent, documentType")
    .replace("url: string, init: RequestInit", "url, init")
    .replaceAll(": Response", "")
    .replaceAll(": Record<string, unknown>", "");
  const factory = new Function("fetch", "OPENAI_MODEL", "OPENAI_API_KEY", "RATEWARE_SCHEMA", "buildInterpretationRequestBody", "runEmailInterpretation", "openAIErrorMessage",
    `${javascript}\nreturn requestRatewareInterpretation;`);
  return factory(fetchImpl, "global-model", "test-placeholder", SCHEMA, buildInterpretationRequestBody, runEmailInterpretation, async (r) => `http ${r.status}`);
}

test("actual handler preserves authentication and bounded email metadata", async () => {
  const seen = [];
  const request = productionRequest(async (url, init) => {
    seen.push({ url, init });
    return { ok: true, json: async () => completed() };
  });
  const result = await request("rules", text("800 USD"), "email");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.headers.Authorization, "Bearer test-placeholder");
  assert.equal(seen[0].init.headers["Content-Type"], "application/json");
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, "gpt-6-luna");
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal(result.__email_model_metadata.usage.input_tokens, 10);
});

test("actual handler leaves non-email request unchanged", async () => {
  const seen = [];
  const request = productionRequest(async (url, init) => {
    seen.push({ url, init });
    return { ok: true, json: async () => ({ output_text: '{"rows":[]}' }) };
  });
  const result = await request("rules", [{ type: "input_file", file_id: "f1" }], "pdf");
  assert.deepEqual(result, { rows: [] });
  const body = JSON.parse(seen[0].init.body);
  assert.deepEqual(Object.keys(body), ["model", "input", "text"]);
  assert.equal(body.model, "global-model");
  assert.equal(seen[0].init.headers.Authorization, "Bearer test-placeholder");
});

test("actual handler rejects oversized input before transport and incomplete output without retry", async () => {
  let calls = 0;
  const request = productionRequest(async () => {
    calls += 1;
    return { ok: true, json: async () => completed({ status: "incomplete" }) };
  });
  await assert.rejects(request("rules", text("x".repeat(EMAIL_MAX_REQUEST_BYTES)), "email"), /too large/);
  assert.equal(calls, 0);
  await assert.rejects(request("rules", text("800 USD"), "email"), /did not complete/);
  assert.equal(calls, 1);
});
