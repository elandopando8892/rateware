import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(
  styles,
  /@media \(max-width: 1320px\) and \(min-width: 861px\) \{[\s\S]*?\.bid-room-page \.bid-room-workspace \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.bid-room-page \.bid-room-control-panel \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 2;/,
  "compact desktop Bid Room should give the active workspace the full row and move operating context below it",
);

assert.match(
  styles,
  /@media \(max-width: 1320px\) and \(min-width: 861px\) \{[\s\S]*?\.bid-room-page \.bid-room-build-column > \.bid-room-stage-panel \{[\s\S]*?grid-row: auto;[\s\S]*?\.bid-room-page \.bid-room-control-panel \{[\s\S]*?position: static;/,
  "compact desktop stage content must contribute its height before the operating context is placed",
);

assert.match(
  styles,
  /@media \(max-width: 1320px\) and \(min-width: 861px\) \{[\s\S]*?\.bid-room-page \.bid-room-flow-shell \.bid-room-stage-rail \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
  "compact desktop stage navigation should use a readable horizontal progression",
);

assert.match(
  styles,
  /@media \(max-width: 1320px\) and \(min-width: 861px\) \{[\s\S]*?\.bid-room-page \.rfx-outreach-launch-grid,[\s\S]*?\.bid-room-page \.rfx-outreach-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  "narrow desktop Launch workspaces should stack instead of compressing carrier and message content",
);

assert.match(
  styles,
  /@media \(max-width: 1320px\) and \(min-width: 861px\) \{[\s\S]*?\.bid-room-page \.rfx-outreach-carrier-wave-actions \{[\s\S]*?flex-direction: column;[\s\S]*?\.bid-room-page \.rfx-outreach-carrier-wave-actions \.action-row \{[\s\S]*?flex-wrap: wrap;/,
  "compact desktop carrier actions should wrap below the guidance instead of collapsing its copy",
);

console.log("Bid Room responsive layout checks passed.");
