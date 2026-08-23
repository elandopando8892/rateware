import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertAccessibleControlNames,
  assertContrastSamples,
  assertFocusCycle,
} from "../tools/platform55-s6-accessibility-certification.mjs";

assert.doesNotThrow(() => assertAccessibleControlNames([], "public-route.html"));
assert.throws(
  () => assertAccessibleControlNames(["button#anonymous"], "public-route.html"),
  /public-route\.html.*accessible names/i,
);

assert.doesNotThrow(() => assertContrastSamples([
  { selector: ".rw-nav-link", ratio: 6.78, threshold: 4.5 },
  { selector: ".rw-page-title", ratio: 3.2, threshold: 3 },
], "tenant-route.html"));
assert.throws(
  () => assertContrastSamples([{ selector: ".rw-nav-link", ratio: 1.2, threshold: 4.5 }], "tenant-route.html"),
  /tenant-route\.html.*contrast/i,
);
assert.throws(() => assertContrastSamples([], "empty-route.html"), /contrast samples/i);

assert.doesNotThrow(() => assertFocusCycle({
  label: "mobile navigation",
  first: "close",
  last: "settings",
  forwardActive: "close",
  backwardActive: "settings",
}));
assert.throws(() => assertFocusCycle({
  label: "mobile navigation",
  first: "close",
  last: "settings",
  forwardActive: "outside-search",
  backwardActive: "settings",
}), /mobile navigation.*forward Tab/i);
assert.throws(() => assertFocusCycle({
  label: "global search",
  first: "close",
  last: "result-3",
  forwardActive: "close",
  backwardActive: "outside-navigation",
}), /global search.*backward Tab/i);

const browserSource = readFileSync("tools/platform55-s6-browser-certification.mjs", "utf8");
const shellSource = readFileSync("src/platform55-shell.js", "utf8");
assert.match(browserSource, /assertAccessibleControlNames\(/);
assert.match(browserSource, /assertContrastSamples\(/);
assert.match(browserSource, /keyboard\.press\("Tab"\)/);
assert.match(browserSource, /keyboard\.press\("Shift\+Tab"\)/);
assert.match(browserSource, /mobile navigation/i);
assert.match(browserSource, /global search/i);
assert.match(browserSource, /interactions\.mobile_drawer_focus_cycle = true/);
assert.match(browserSource, /interactions\.search_focus_cycle = true/);
assert.match(shellSource, /event\.key === "Tab"/);
assert.match(shellSource, /trapFocusWithin\(event, state\.sidebar\)/);

console.log("Platform55 S6 accessibility certification contract passed.");
