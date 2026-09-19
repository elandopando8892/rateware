import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");

const renderLanes = source.match(/function renderLanes\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(
  renderLanes,
  /rfxWorkbench\?\.current\(\) === "responses"\) renderResponseBoard\(\)/,
  "large response boards should render only when the Operate stage is active"
);
assert.match(
  renderLanes,
  /rfxWorkbench\?\.current\(\) === "responses"\) renderLiveOfferManager\(\)/,
  "live-offer rendering should stay lazy until the Operate stage is active"
);
assert.match(
  renderLanes,
  /rfxWorkbench\?\.current\(\) === "award"\) renderAwardBoard\(\)/,
  "award rendering should stay lazy until the Close stage is active"
);
assert.doesNotMatch(
  renderLanes,
  /\n\s*renderResponseBoard\(\);/,
  "launching a large RFx must not eagerly create thousands of hidden response rows"
);

assert.match(source, /const RESPONSE_BOARD_RENDER_LIMIT = 250;/, "response rendering should have an explicit DOM row ceiling");
assert.match(
  source,
  /const visibleRows = rows\.slice\(0, RESPONSE_BOARD_RENDER_LIMIT\);/,
  "the response table should render a bounded row slice"
);
assert.match(
  source,
  /Showing the first \$\{formatNumber\(visibleRows\.length\)\} rows/,
  "operators should be told when the response table is intentionally bounded"
);
assert.match(
  source,
  /\[data-workbench-view-button='responses'\][\s\S]*renderResponseBoard\(\);[\s\S]*renderLiveOfferManager\(\);/,
  "opening Operate should render its deferred response surfaces"
);

console.log("Bid Room large-event performance contract passed.");
