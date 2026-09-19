import assert from "node:assert/strict";

const source = await Deno.readTextFile(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url));
const extracted = source.match(/async function fetchAllRfxLaneVendorRows\([\s\S]*?^}/m)?.[0];
assert.ok(extracted);
const harness = `type RatewareSupabaseClient = any;
const RFX_LANE_VENDOR_PAGE_SIZE = 1000;
const RFX_LANE_VENDOR_MAX_ROWS = 50000;
export ${extracted}`;
const { fetchAllRfxLaneVendorRows: load } = await import(`data:application/typescript;base64,${btoa(harness)}`);

function database(count: number, failure = -1) {
  const rows = Array.from({ length: count }, (_, id) => ({ id, vendor_id: id % 92 }));
  const calls: any[] = [];
  let active = 0;
  let peak = 0;
  const db = {
    from(table: string) {
      assert.equal(table, "rfx_lane_vendors");
      const scope: any[] = [];
      const q: any = {};
      for (const method of ["select", "eq", "order"]) q[method] = (...args: any[]) => { scope.push([method, ...args]); return q; };
      q.range = async (first: number, last: number) => {
        calls.push({ first, last, scope });
        peak = Math.max(peak, ++active);
        // Different completion order must not reorder the response.
        await new Promise((resolve) => setTimeout(resolve, first % 3000 === 1000 ? 3 : 0));
        active--;
        return first === failure ? { error: { message: "failed page" } } : { data: rows.slice(first, last + 1) };
      };
      return q;
    }
  };
  return { db, rows, calls, peak: () => peak };
}

Deno.test("bounded parallel detail is identical to sequential pagination at boundaries", async () => {
  for (const count of [0, 1, 999, 1000, 1001, 3000, 6348]) {
    const parallel = database(count);
    const serial = database(count);
    assert.deepEqual(await load(parallel.db, "owned-event", "columns", 3), await load(serial.db, "owned-event", "columns"));
    assert.ok(parallel.peak() <= 3);
    assert.equal(serial.peak(), 1);
    if (count < 1000) assert.equal(parallel.calls.length, 1);
    for (const call of parallel.calls) assert.deepEqual(call.scope, [
      ["select", "columns"], ["eq", "rfx_event_id", "owned-event"],
      ["order", "created_at", { ascending: true }], ["order", "id", { ascending: true }]
    ]);
  }
});

Deno.test("parallel detail fails closed on page errors and preserves maximum-row guard", async () => {
  for (const failure of [0, 1000, 2000, 6000]) {
    const test = database(6348, failure);
    await assert.rejects(load(test.db, "owned-event", "*", 3), /failed page/);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const capped = database(50000);
  await assert.rejects(load(capped.db, "owned-event", "*", 3), /exceeded 50000/);
  assert.ok(capped.calls.every((call) => call.last < 50000));
});
