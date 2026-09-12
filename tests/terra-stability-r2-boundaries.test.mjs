import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");

function explicitInvitationChunks(count) {
  return Math.ceil(count / 100);
}

function hydrationOutcome(totalRows) {
  let offset = 0;
  let remaining = totalRows;
  while (true) {
    const pageSize = Math.min(1000, remaining);
    remaining -= pageSize;
    if (pageSize < 1000) return "complete";
    offset += 1000;
    if (offset >= 25000) return "safe-per-batch-limit";
  }
}

test("R2 records the current explicit selection limit without claiming an end-to-end large-wave fix", () => {
  assert.match(apiSource, /RFX_OUTREACH_INVITATION_ID_LIMIT\s*=\s*50000/);
  assert.equal(explicitInvitationChunks(4999), 50);
  assert.equal(explicitInvitationChunks(5000), 50);
  assert.equal(explicitInvitationChunks(5001), 51);
  assert.equal(explicitInvitationChunks(50000), 500);
  assert.match(apiSource, /limit:\s*RFX_OUTREACH_INVITATION_ID_LIMIT/);
  assert.doesNotMatch(apiSource, /RFX_OUTREACH_INVITATION_ID_LIMIT\s*=\s*50001/);
});

test("R2 records the exact 25k hydration boundary for a later implementation packet", () => {
  assert.match(apiSource, /if \(offset >= 25000\) throw new Error\("Outreach lane hydration exceeded the safe per-batch limit\."\)/);
  assert.equal(hydrationOutcome(24999), "complete");
  assert.equal(hydrationOutcome(25000), "safe-per-batch-limit");
  assert.equal(hydrationOutcome(25001), "safe-per-batch-limit");
});
