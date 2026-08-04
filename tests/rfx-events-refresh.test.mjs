import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");

test("RFx imports do not reload event detail before the forced event refresh", () => {
  const duplicateRefresh = /await loadDetail\(eventId(?:, \{ force: true \})?\);\s*(?:if \(selectedEventId !== eventId\) return;\s*)?await loadEvents\(\{ force: true \}\);/g;

  assert.deepEqual(source.match(duplicateRefresh), null);
});

test("forced event refresh still reloads the selected event detail", () => {
  assert.match(
    source,
    /async function loadEventsRequest\(\)[\s\S]*?renderEvents\(\);\s*if \(selectedEventId\) await loadDetail\(selectedEventId\);/
  );
});
