import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/rateware-api.js", import.meta.url), "utf8")
  .replace('import { authenticatedFetch } from "./auth.js";', "const authenticatedFetch = (...args) => globalThis.__ratewareApiClientTestFetch(...args);")
  .replace('import { SUPABASE_URL } from "./config.js";', 'const SUPABASE_URL = "https://rateware.test";');
const client = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function failedResponse(status, payload, requestId = "") {
  return {
    ok: false,
    status,
    headers: { get: (name) => name.toLowerCase() === "x-request-id" ? requestId : null },
    text: async () => JSON.stringify(payload)
  };
}

async function captureFailure(responseOrError) {
  globalThis.__ratewareApiClientTestFetch = async () => {
    if (responseOrError instanceof Error) throw responseOrError;
    return responseOrError;
  };
  try {
    await client.callRatewareApi("list_carrier_list_templates", { limit: 1 });
    assert.fail("Expected the client request to reject");
  } catch (error) {
    return error;
  }
}

const disabled = await captureFailure(failedResponse(404, {
  enabled: false,
  error: "Carrier list templates are disabled.",
  incident_id: "incident-payload"
}, "incident-header"));
assert.equal(disabled.enabled, false, "A structured disabled envelope should preserve its explicit boolean capability");
assert.equal(disabled.status, 404, "Structured capability errors should preserve HTTP status");
assert.equal(disabled.incidentId, "incident-payload", "Structured capability errors should preserve correlation metadata");

for (const [label, response] of [
  ["ordinary 404", failedResponse(404, { error: "Not found" }, "request-404")],
  ["ordinary 500", failedResponse(500, { error: "Internal error" }, "request-500")]
]) {
  const error = await captureFailure(response);
  assert.equal(Object.hasOwn(error, "enabled"), false, `${label} should not be classified as disabled`);
  assert.equal(error.status, response.status, `${label} should preserve status`);
  assert.equal(error.incidentId, response.headers.get("x-request-id"), `${label} should preserve the request correlation id`);
}

const networkFailure = Object.assign(new Error("network unavailable"), { code: "ECONNRESET" });
const networkError = await captureFailure(networkFailure);
assert.equal(networkError, networkFailure, "Network failures should propagate without message-based capability classification");
assert.equal(Object.hasOwn(networkError, "enabled"), false, "Network failures should not expose capability metadata");

delete globalThis.__ratewareApiClientTestFetch;
console.log("rateware-api client error tests passed");
