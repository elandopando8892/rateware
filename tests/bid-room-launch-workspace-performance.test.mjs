import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/rfx-events.js", import.meta.url), "utf8");

const launchpad = source.match(/function renderOutreachLaunchpad\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(launchpad, /if \(rfxLaunchWorkspace === "carrier"\)/, "Carrier Fit should have a dedicated render path");
assert.match(launchpad, /if \(rfxLaunchWorkspace === "message"\)/, "Message should have a dedicated render path");
assert.match(launchpad, /if \(rfxLaunchWorkspace === "delivery"\) renderDraftQueue\(\)/, "Delivery should render its queue on demand");
assert.match(launchpad, /renderOutreachAudience\(\);\s*return;/, "Carrier Fit should stop before hidden workspaces render");
assert.match(launchpad, /renderTouchpoints\(\);\s*return;/, "Message should stop before Delivery renders");

const activation = source.match(/function activateRfxLaunchWorkspace\(workspace, options = \{\}\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(activation, /if \(rfxLaunchWorkspace === "carrier"\)[\s\S]*renderOutreachAudience\(\)/, "Opening Carrier Fit should refresh its audience");
assert.match(activation, /if \(rfxLaunchWorkspace === "message"\)[\s\S]*renderOutreachPreview\(\)/, "Opening Message should build its preview");

console.log("Bid Room Launch workspace performance checks passed.");
