import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");

assert.match(
  apiSource,
  /hydrateRfxBoardInvitationTokens[\s\S]*mapWithConcurrency\(rows, 24/,
  "large RFx token hydration should use bounded concurrency"
);
assert.match(
  apiSource,
  /const compactVendors = body\.compact_vendors === true;/,
  "compact carrier profiles must remain an opt-in response contract"
);
assert.match(
  apiSource,
  /const compactVendorRows = new Map[\s\S]*compactVendorRows\.set\(vendorId, vendor\)/,
  "compact detail should deduplicate CRM profiles by carrier"
);
assert.match(
  apiSource,
  /if \(!compactVendors\) return invitationWithComparison\(invitation, benchmark\)/,
  "legacy clients should preserve the original nested carrier response"
);
assert.match(
  apiSource,
  /\.\.\.\(compactVendors \? \{ vendors: \[\.\.\.compactVendorRows\.values\(\)\] \} : \{\}\)/,
  "compact clients should receive one carrier profile collection"
);

console.log("Bid Room compact detail contract passed.");
