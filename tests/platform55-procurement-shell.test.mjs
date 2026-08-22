import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tenantPages = Object.freeze([
  ["vendors.html", "vendors", "src/vendors.js"],
  ["rfx-process.html", "rfx-process", "src/rfx-process.js"],
  ["rfx-events.html", "rfx-events", "src/rfx-events.js"],
  ["ratebook.html", "ratebook", "src/ratebook.js"],
  ["outreach.html", "outreach", "src/outreach.js"]
]);

const publicPages = Object.freeze([
  ["carrier-profile.html", "carrier-profile", ["src/carrier-profile.js"]],
  ["rfx-bid.html", "rfx-bid", ["src/rfx-bid.js", "src/rfx-bid-chat-cache.js"]],
  ["bid-room-board.html", "bid-room-board", ["src/bid-room-board.js"]],
  ["customer-rfi.html", "customer-rfi", ["src/customer-rfi.js"]],
  ["ratebook-carrier.html", "ratebook-carrier", ["src/ratebook-carrier.js"]]
]);

const procurementCss = readFileSync("src/platform55-procurement.css", "utf8");
const publicCss = readFileSync("src/platform55-public-shell.css", "utf8");

for (const primitive of [
  "rw-procurement-page",
  "rw-procurement-status",
  "rw-procurement-milestones",
  "rw-procurement-table-scroll",
  "rw-procurement-response",
  "rw-procurement-readiness"
]) {
  assert.match(procurementCss, new RegExp(`\\.${primitive}\\b`), `${primitive} must be reusable`);
}

for (const primitive of [
  "rw-public-app",
  "rw-public-header",
  "rw-public-context",
  "rw-public-workspace",
  "rw-public-actions",
  "rw-public-state"
]) {
  assert.match(publicCss, new RegExp(`\\.${primitive}\\b`), `${primitive} must be reusable`);
}

for (const css of [procurementCss, publicCss]) {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i, "Procurement styles must consume shared tokens");
  assert.match(css, /var\(--rw-/, "Procurement styles must use the Platform55 token namespace");
  assert.match(css, /@media\s*\(max-width:\s*900px\)/i, "Procurement styles must define the mobile composition");
  assert.match(css, /prefers-reduced-motion:\s*reduce/i, "Procurement styles must respect reduced motion");
}

assert.match(procurementCss, /\.rw-procurement-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
assert.match(publicCss, /\.rw-public-actions\s*\{[^}]*position:\s*sticky/s);

for (const [file, key, script] of tenantPages) {
  const html = readFileSync(file, "utf8");
  const source = readFileSync(script, "utf8");
  assert.equal((html.match(/data-platform55-shell="tenant"/g) || []).length, 1, `${file} must use the tenant shell once`);
  assert.equal((html.match(new RegExp(`data-platform55-page="${key}"`, "g")) || []).length, 1, `${file} must publish its route key once`);
  assert.equal((html.match(/platform55-shell\.css/g) || []).length, 1, `${file} must include the tenant shell CSS once`);
  assert.equal((html.match(/platform55-procurement\.css/g) || []).length, 1, `${file} must include procurement CSS once`);
  assert.equal((html.match(/data-platform55-app(?:\s|>)/g) || []).length, 1, `${file} must expose one tenant app host`);
  assert.equal((html.match(/data-platform55-sidebar(?:\s|>)/g) || []).length, 1, `${file} must expose one tenant sidebar host`);
  assert.equal((html.match(/data-platform55-topbar(?:\s|>)/g) || []).length, 1, `${file} must expose one tenant topbar host`);
  assert.equal((html.match(/<main\b/g) || []).length, 1, `${file} must retain one main landmark`);
  assert.doesNotMatch(html, /class="[^"]*\b(?:shell-layout|side-nav|nav-groups)\b/);
  assert.match(source, /initAuthControls\s*\(/, `${script} must preserve auth initialization`);
  assert.match(source, /requirePrivatePage\s*\(/, `${script} must preserve its private-page gate`);
}

const vendorHtml = readFileSync("vendors.html", "utf8");
const vendorSource = readFileSync("src/vendors.js", "utf8");
assert.match(vendorHtml, /data-platform55-procurement-state="vendor-directory"/);
assert.match(vendorHtml, /class="[^"]*rw-procurement-milestones[^"]*"/);
assert.match(vendorSource, /updatePlatform55Shell\s*\(\s*\{\s*pageState:/s);
assert.match(vendorSource, /status:\s*"Loading carrier directory"/);
assert.match(vendorSource, /status:\s*`\$\{rows\.length\.toLocaleString\(\)\} carrier record\(s\) loaded`/);
assert.match(vendorSource, /status:\s*"Carrier directory could not load"/);

const rfxEventsHtml = readFileSync("rfx-events.html", "utf8");
const rfxEventsSource = readFileSync("src/rfx-events.js", "utf8");
assert.match(rfxEventsHtml, /data-platform55-procurement-state="event-lifecycle"/);
assert.match(rfxEventsSource, /updatePlatform55Shell\s*\(\s*\{\s*pageState:/s);
assert.match(rfxEventsSource, /status:\s*"Loading bid events"/);
assert.match(rfxEventsSource, /status:\s*`\$\{events\.length\.toLocaleString\(\)\} bid event\(s\) loaded`/);
assert.match(rfxEventsSource, /status:\s*"Bid events could not load"/);
for (const key of ["rfx_event_id", "draft_search"]) {
  assert.match(rfxEventsSource, new RegExp(`(?:get|set)\\(["']${key}["']`), `Bid Room must preserve ${key} URL state`);
}
assert.match(rfxEventsSource, /window\.history\.replaceState\s*\(/, "Bid Room filters must remain shareable through the URL");

const rfxProcessHtml = readFileSync("rfx-process.html", "utf8");
const rfxProcessSource = readFileSync("src/rfx-process.js", "utf8");
assert.match(rfxProcessHtml, /data-platform55-procurement-state="process-readiness"/);
assert.match(rfxProcessSource, /Operations handoff JSON downloaded locally\. No shipment or dispatch was created\./);
const renderPanelsBody = rfxProcessSource.match(/function renderPanels\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert.doesNotMatch(renderPanelsBody, /awardPanel\s*\(/, "Shell adoption must not mount dormant award mutations");

const ratebookHtml = readFileSync("ratebook.html", "utf8");
assert.match(ratebookHtml, /data-platform55-procurement-state="ratebook-review"/);
assert.match(ratebookHtml, /id="send-ratebook-distribution"[^>]*class="[^"]*hidden|class="[^"]*hidden[^>]*id="send-ratebook-distribution"/);

const outreachHtml = readFileSync("outreach.html", "utf8");
assert.match(outreachHtml, /data-platform55-procurement-state="outreach-drafts"/);
assert.match(outreachHtml, /Create campaign/);
assert.doesNotMatch(outreachHtml, /data-platform55-action="(?:send|dispatch|promote)"/i, "Shell actions must not expose consequential outreach mutations");

const privateSurfacePattern = /data-platform55-(?:sidebar|topbar)|(?:href|src)="[^"]*(?:settings|upload-center|staging-review|business-intelligence)\.html|\bAsk AI\b|notification center/i;

for (const [file, key, scripts] of publicPages) {
  const html = readFileSync(file, "utf8");
  const source = scripts.map((script) => readFileSync(script, "utf8")).join("\n");
  assert.equal((html.match(/data-platform55-shell="public"/g) || []).length, 1, `${file} must use the public shell once`);
  assert.equal((html.match(new RegExp(`data-platform55-page="${key}"`, "g")) || []).length, 1, `${file} must publish its route key once`);
  assert.equal((html.match(/platform55-tokens\.css/g) || []).length, 1, `${file} must include shared tokens once`);
  assert.equal((html.match(/platform55-public-shell\.css/g) || []).length, 1, `${file} must include public shell CSS once`);
  assert.equal((html.match(/data-platform55-public-app(?:\s|>)/g) || []).length, 1, `${file} must expose one public app host`);
  assert.equal((html.match(/<main\b/g) || []).length, 1, `${file} must retain one main landmark`);
  assert.doesNotMatch(html, privateSurfacePattern, `${file} must not expose private tenant controls or links`);
  assert.doesNotMatch(source, /from\s*["']\.\/auth\.js["']|initAuthControls|requirePrivatePage/, `${file} must not import tenant auth bootstrap`);
}

console.log("Platform55 procurement shell contract passed.");
