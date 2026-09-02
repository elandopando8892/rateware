import assert from "node:assert/strict";

import {
  OSP_PUBLIC_ERROR_CODES,
  OspApiError,
  safeErrorResponse,
} from "./http.ts";

const EXPECTED_STATUS = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  METHOD_NOT_ALLOWED: 405,
  CONTENT_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  WORKSPACE_UNAVAILABLE: 403,
  DEPENDENCY_UNAVAILABLE: 503,
  FULFILLMENT_BLOCKED: 409,
  INTERNAL_ERROR: 500,
} as const;

Deno.test("safeErrorResponse implements the exact strict OspSafeError envelope and status mapping", async () => {
  assert.deepEqual(OSP_PUBLIC_ERROR_CODES, Object.keys(EXPECTED_STATUS));
  for (const code of OSP_PUBLIC_ERROR_CODES) {
    const response = safeErrorResponse(
      new OspApiError(code),
      "incident-synthetic",
    );
    assert.equal(response.status, EXPECTED_STATUS[code]);
    assert.deepEqual(await response.json(), {
      error: { code, incident_id: "incident-synthetic" },
    });
    assert.equal(
      response.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(
      response.headers.get("allow"),
      code === "METHOD_NOT_ALLOWED" ? "POST, OPTIONS" : null,
    );
    assert.equal(
      response.headers.get("www-authenticate"),
      code === "UNAUTHORIZED" ? 'Bearer realm="osp-read-api"' : null,
    );
  }
});

Deno.test("safeErrorResponse reduces an invalid branded or raw error to exact INTERNAL_ERROR", async () => {
  const invalidBranded = new OspApiError("INTERNAL_ERROR");
  (invalidBranded as unknown as { code: string }).code = "PRIVATE_ERROR";
  for (
    const error of [invalidBranded, new Error("private raw dependency detail")]
  ) {
    const response = safeErrorResponse(error, "incident-synthetic");
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: "INTERNAL_ERROR", incident_id: "incident-synthetic" },
    });
  }
});
