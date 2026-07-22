import assert from "node:assert/strict";
import { humanizeError } from "../src/error-copy.js";
import { buildStoragePath, detectDocumentType, sanitizeFilename } from "../src/file-rules.js";
import { cleanRateValue, isInvalidRateValue, normalizeConfidence } from "../src/rateware-rules.js";

function file(name, type = "", size = 1) {
  return { name, type, size };
}

assert.equal(detectDocumentType(file("quote.xlsx")), "xlsx");
assert.equal(detectDocumentType(file("quote.pdf")), "pdf");
assert.equal(detectDocumentType(file("quote.eml", "message/rfc822")), "email");
assert.equal(detectDocumentType(file("rate.PNG", "image/png")), "image");
assert.equal(detectDocumentType(file("rate.txt", "text/plain")), "unsupported");

assert.equal(sanitizeFilename("Carrier Rate Sheet (Final).xlsx"), "Carrier_Rate_Sheet_Final_.xlsx");

const storage = buildStoragePath(
  file("Carrier Rate Sheet.xlsx"),
  "00000000-0000-4000-8000-000000000000",
  new Date("2026-06-06T12:00:00Z")
);

assert.equal(storage.path, "2026/06/00000000-0000-4000-8000-000000000000/Carrier_Rate_Sheet.xlsx");

assert.equal(isInvalidRateValue("Tier 1"), true);
assert.equal(isInvalidRateValue("X"), true);
assert.equal(isInvalidRateValue("N/A"), true);
assert.equal(isInvalidRateValue("Please Estimate"), true);
assert.equal(cleanRateValue("$3,500"), "$3,500");
assert.equal(cleanRateValue("Tier 2"), null);
assert.equal(normalizeConfidence(2), 1);
assert.equal(normalizeConfidence(-1), 0);
assert.match(humanizeError({ message: "insufficient_quota" }), /OpenAI quota/);
assert.match(humanizeError("401 unauthorized"), /session/);
const structuredBackendError = Object.assign(new Error("HTTP 500: outreach insert failed"), {
  status: 500,
  code: "23505",
  details: "Duplicate outreach recipient",
  hint: "Reuse the existing draft",
  incidentId: "incident-test-123"
});
assert.match(humanizeError(structuredBackendError), /outreach insert failed/, "Structured backend causes should not collapse into a generic server error");
assert.match(humanizeError(structuredBackendError), /incident-test-123/, "Backend incident IDs should remain visible to the user");

console.log("Upload Center file rules passed.");
