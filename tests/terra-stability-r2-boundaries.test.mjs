import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertOutreachMatrixWithinLimit,
  fetchBoundedKeysetRows,
  OUTREACH_RELATED_ROW_BATCH_LIMIT
} from "../supabase/functions/rateware-api/outreach-pagination.js";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");

function explicitInvitationChunks(count) {
  return Math.ceil(count / 100);
}

function rowId(index) {
  return String(index + 1).padStart(8, "0");
}

async function fetchSyntheticRows(totalRows) {
  return await fetchBoundedKeysetRows({
    label: "Synthetic outreach rows",
    fetchPage: async ({ afterId, limit }) => {
      const offset = afterId ? Number(afterId) : 0;
      return Array.from({ length: Math.min(limit, Math.max(0, totalRows - offset)) }, (_, index) => ({
        id: rowId(offset + index)
      }));
    }
  });
}

test("R2 records the current explicit selection limit without claiming an end-to-end large-wave fix", () => {
  assert.match(apiSource, /RFX_OUTREACH_INVITATION_ID_LIMIT\s*=\s*50000/);
  assert.equal(explicitInvitationChunks(4999), 50);
  assert.equal(explicitInvitationChunks(5000), 50);
  assert.equal(explicitInvitationChunks(5001), 51);
  assert.equal(explicitInvitationChunks(50000), 500);
  assert.match(apiSource, /limit:\s*RFX_OUTREACH_INVITATION_ID_LIMIT/);
  assert.doesNotMatch(apiSource, /RFX_OUTREACH_INVITATION_ID_LIMIT\s*=\s*50001/);
  assert.match(apiSource, /RFX_OUTREACH_ALL_ELIGIBLE_LIMIT\s*=\s*5000/);
});

test("R2 accepts the exact 25k boundary and rejects only a sentinel beyond it", async () => {
  assert.equal((await fetchSyntheticRows(24999)).length, 24999);
  assert.equal((await fetchSyntheticRows(25000)).length, 25000);
  await assert.rejects(() => fetchSyntheticRows(25001), /exceeded the safe per-batch limit of 25000 rows/);
  assert.equal(OUTREACH_RELATED_ROW_BATCH_LIMIT, 25000);
});

test("R2 uses deterministic keyset pagination for hydration and history", () => {
  const generateBlock = apiSource.slice(
    apiSource.indexOf('if (body.action === "generate_outreach_drafts")'),
    apiSource.indexOf('if (body.action === "list_outreach_messages")')
  );
  assert.match(generateBlock, /label: "Outreach lane hydration"[\s\S]+\.order\("id", \{ ascending: true \}\)[\s\S]+\.gt\("id", afterId\)/);
  assert.match(generateBlock, /label: "Outreach history load"[\s\S]+\.order\("id", \{ ascending: true \}\)[\s\S]+\.gt\("id", afterId\)/);
  assert.doesNotMatch(generateBlock, /offset >= 25000/);
});

test("R2 fails closed on duplicate or out-of-order pages", async () => {
  await assert.rejects(() => fetchBoundedKeysetRows({
    label: "Duplicate probe",
    pageSize: 2,
    limit: 4,
    fetchPage: async ({ afterId }) => afterId ? [{ id: "00000002" }] : [{ id: "00000001" }, { id: "00000002" }]
  }), /outside deterministic id order|duplicate row/);
});

test("R2 enforces one 50k carrier-lane matrix before coverage writes", () => {
  assert.deepEqual(assertOutreachMatrixWithinLimit({ carrierCount: 89, laneCount: 69, loadedRows: 89, limit: 50000 }), {
    carrier_count: 89,
    lane_count: 69,
    matrix_rows: 6141,
    limit: 50000
  });
  assert.equal(assertOutreachMatrixWithinLimit({ carrierCount: 100, laneCount: 500, loadedRows: 100, limit: 50000 }).matrix_rows, 50000);
  assert.throws(
    () => assertOutreachMatrixWithinLimit({ carrierCount: 101, laneCount: 496, loadedRows: 101, limit: 50000 }),
    /requires 50096 carrier-lane rows/
  );
});
