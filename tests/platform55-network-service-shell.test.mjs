import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { listProviderServiceTests } from "../tools/run-provider-service-tests.mjs";

const providerInventory = execFileSync("git", ["ls-files", "tests/provider-service-*.test.mjs"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .map((file) => basename(file))
  .sort();
const enumeratedProviderTests = listProviderServiceTests();
assert.equal(enumeratedProviderTests.length, providerInventory.length, "Provider Service runner must enumerate every tracked test");
assert.deepEqual(enumeratedProviderTests, providerInventory, "Provider Service runner inventory must match Git exactly");

const networkCss = readFileSync("src/platform55-network-service.css", "utf8");
for (const primitive of [
  "rw-network-service-page",
  "rw-network-service-state",
  "rw-network-service-metrics",
  "rw-network-service-table-scroll",
  "rw-network-service-detail",
  "rw-network-service-boundary"
]) {
  assert.match(networkCss, new RegExp(`\\.${primitive}\\b`), `${primitive} must be reusable`);
}
assert.doesNotMatch(networkCss, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i, "Network/service styles must consume shared tokens");
assert.match(networkCss, /var\(--rw-/, "Network/service styles must use the Platform55 token namespace");
assert.match(networkCss, /@media\s*\(max-width:\s*900px\)/i, "Network/service styles must define the mobile composition");
assert.match(networkCss, /prefers-reduced-motion:\s*reduce/i, "Network/service styles must respect reduced motion");

const shipperCrmHtml = readFileSync("shipper-crm.html", "utf8");
const shipperCrmSource = readFileSync("src/shippers.js", "utf8");
assert.match(shipperCrmHtml, /data-platform55-network-state="shipper-directory"/, "Shipper CRM must expose its directory state");
assert.match(shipperCrmHtml, /class="[^"]*rw-network-service-metrics[^"]*"/, "Shipper CRM summary must use the network metric primitive");
assert.match(shipperCrmHtml, /class="[^"]*rw-network-service-table-scroll[^"]*"/, "Shipper CRM directory must bound wide tables");
assert.match(shipperCrmSource, /updatePlatform55Shell\s*\(\s*\{\s*pageState:/s, "Shipper CRM must publish shell page state");
for (const stateText of ["Loading shipper accounts", "shipper account(s) loaded", "Shipper accounts could not load"]) {
  assert.match(shipperCrmSource, new RegExp(stateText.replace(/[()]/g, "\\$&")), `Shipper CRM must publish ${stateText}`);
}
assert.match(shipperCrmSource, /initAuthControls\s*\(/, "Shipper CRM must preserve auth initialization");
assert.match(shipperCrmSource, /requirePrivatePage\s*\(/, "Shipper CRM must preserve its private-page gate");

const shipperProfileSource = readFileSync("src/shipper-profile.js", "utf8");
assert.match(shipperProfileSource, /data-platform55-public-state/, "Shipper profile dynamic content must preserve public state semantics");
assert.match(shipperProfileSource, /data-state="signed-out"/, "Shipper profile must expose a signed-out state");
assert.match(shipperProfileSource, /data-state="expired"/, "Shipper profile must expose an expired-link state");
assert.match(shipperProfileSource, /data-state="error"/, "Shipper profile must expose an error state");
assert.doesNotMatch(shipperProfileSource, /from\s*["']\.\/auth\.js["']|initAuthControls|requirePrivatePage/, "Public shipper profile must not import tenant auth bootstrap");

const vendorSupportHtml = readFileSync("vendor-support.html", "utf8");
const vendorSupportSource = readFileSync("src/vendor-support.js", "utf8");
assert.match(vendorSupportHtml, /data-platform55-network-state="vendor-support"/, "Vendor Support must expose its service-case state");
assert.match(vendorSupportHtml, /class="[^"]*rw-network-service-metrics[^"]*"/, "Vendor Support metrics must use the network primitive");
assert.match(vendorSupportHtml, /class="[^"]*rw-network-service-table-scroll[^"]*"/, "Vendor Support cases must bound wide tables");
assert.match(vendorSupportSource, /updatePlatform55Shell\s*\(\s*\{\s*pageState:/s, "Vendor Support must publish shell page state");
for (const stateText of ["Loading vendor support cases", "vendor support case(s) loaded", "Vendor support cases could not load"]) {
  assert.match(vendorSupportSource, new RegExp(stateText.replace(/[()]/g, "\\$&")), `Vendor Support must publish ${stateText}`);
}
assert.match(vendorSupportSource, /escapeHtml\s*\(/, "Vendor Support variable text must remain escaped");
assert.match(vendorSupportSource, /applyPermissionState\s*\(/, "Vendor Support must preserve permission-disabled actions");

const vendorImprovementHtml = readFileSync("vendor-improvement.html", "utf8");
const vendorImprovementSource = readFileSync("src/vendor-improvement.js", "utf8");
assert.match(vendorImprovementHtml, /data-platform55-network-state="vendor-improvement"/, "Vendor CI must expose its improvement-plan state");
assert.match(vendorImprovementHtml, /class="[^"]*rw-network-service-metrics[^"]*"/, "Vendor CI metrics must use the network primitive");
assert.match(vendorImprovementHtml, /class="[^"]*rw-network-service-table-scroll[^"]*"/, "Vendor CI cases must bound wide tables");
assert.match(vendorImprovementSource, /updatePlatform55Shell\s*\(\s*\{\s*pageState:/s, "Vendor CI must publish shell page state");
for (const stateText of ["Loading vendor improvement cases", "vendor improvement case(s) loaded", "Vendor improvement cases could not load"]) {
  assert.match(vendorImprovementSource, new RegExp(stateText.replace(/[()]/g, "\\$&")), `Vendor CI must publish ${stateText}`);
}
assert.match(vendorImprovementSource, /escapeHtml\s*\(/, "Vendor CI variable text must remain escaped");
assert.match(vendorImprovementSource, /applyPermissionState\s*\(/, "Vendor CI must preserve permission-disabled actions");

for (const html of [vendorSupportHtml, vendorImprovementHtml]) {
  assert.doesNotMatch(html, /data-platform55-action="(?:send|dispatch|approve|promote|release|remediate)"/i, "Shell actions must not expose consequential vendor mutations");
}

const providerPages = Object.freeze([
  {
    htmlFile: "provider-service.html",
    sourceFile: "src/provider-service-page.js",
    state: "provider-review-queue",
    states: ["Loading provider review queue", "provider relationship(s) loaded", "Provider review queue could not load"],
    actions: ["list_provider_service_command_center"]
  },
  {
    htmlFile: "provider-onboarding.html",
    sourceFile: "src/provider-onboarding-page.js",
    state: "onboarding-readiness",
    states: ["Loading provider onboarding readiness", "onboarding case(s) loaded", "Provider onboarding readiness could not load"],
    actions: ["list_provider_onboarding_workspace", "get_provider_onboarding_case"]
  },
  {
    htmlFile: "provider-gmail.html",
    sourceFile: "src/provider-gmail-page.js",
    state: "gmail-connectivity",
    states: ["Loading Gmail connectivity", "Gmail connectivity loaded", "Gmail connectivity could not load"],
    actions: ["provider_gmail_status", "start_provider_gmail_oauth", "sync_provider_gmail_inbox", "renew_provider_gmail_watch"]
  },
  {
    htmlFile: "provider-communications.html",
    sourceFile: "src/provider-communications-page.js",
    state: "communication-history",
    states: ["Loading provider communication history", "provider communication thread(s) loaded", "Provider communication history could not load"],
    actions: ["list_provider_communications_inbox", "get_provider_communication_thread"]
  }
]);

for (const { htmlFile, sourceFile, state, states, actions } of providerPages) {
  const html = readFileSync(htmlFile, "utf8");
  const source = readFileSync(sourceFile, "utf8");
  assert.match(html, new RegExp(`data-platform55-network-state="${state}"`), `${htmlFile} must expose ${state}`);
  assert.match(source, /updatePlatform55Shell\s*\(\s*\{\s*pageState:/s, `${sourceFile} must publish shell page state`);
  assert.match(source, /escapeHtml\s*[=(]/, `${sourceFile} must keep variable text escaped`);
  assert.match(source, /requirePrivatePage\s*\(/, `${sourceFile} must preserve a private-page gate`);
  for (const stateText of states) {
    assert.match(source, new RegExp(stateText.replace(/[()]/g, "\\$&")), `${sourceFile} must publish ${stateText}`);
  }
  for (const action of actions) assert.match(source, new RegExp(`["']${action}["']`), `${sourceFile} must preserve ${action}`);
  assert.doesNotMatch(html, /data-platform55-action="(?:send|dispatch|approve|promote|release|modify-provider)"/i, `${htmlFile} shell must expose summary-only actions`);
}

assert.match(
  readFileSync("src/provider-gmail-page.js", "utf8"),
  /renderConnection\(\);\s*updateProviderGmailShell\('Gmail connectivity loaded'\);\s*if \(!quiet\)/,
  "Provider Gmail must publish the loaded shell state even when callback status text stays quiet"
);
assert.match(readFileSync("provider-onboarding.html", "utf8"), /class="[^"]*rw-network-service-boundary[^"]*"/, "Provider Onboarding must retain the controlled-action boundary");
assert.match(readFileSync("provider-communications.html", "utf8"), /class="[^"]*rw-network-service-detail[^"]*"/, "Provider Communications must expose bounded thread detail");

const tenantPages = Object.freeze([
  ["shipper-crm.html", "shipper-crm"],
  ["vendor-support.html", "vendor-support"],
  ["vendor-improvement.html", "vendor-improvement"],
  ["provider-service.html", "provider-service"],
  ["provider-onboarding.html", "provider-onboarding"],
  ["provider-gmail.html", "provider-gmail"],
  ["provider-communications.html", "provider-communications"]
]);

for (const [file, pageKey] of tenantPages) {
  const html = readFileSync(file, "utf8");
  assert.equal((html.match(/data-platform55-shell="tenant"/g) || []).length, 1, `${file} must use the tenant shell once`);
  assert.equal((html.match(new RegExp(`data-platform55-page="${pageKey}"`, "g")) || []).length, 1, `${file} must publish its route key once`);
  assert.equal((html.match(/platform55-tokens\.css/g) || []).length, 1, `${file} must include shared tokens once`);
  assert.equal((html.match(/platform55-shell\.css/g) || []).length, 1, `${file} must include tenant shell CSS once`);
  assert.equal((html.match(/platform55-network-service\.css/g) || []).length, 1, `${file} must include network/service CSS once`);
  assert.equal((html.match(/data-platform55-app(?:\s|>)/g) || []).length, 1, `${file} must expose one tenant app host`);
  assert.equal((html.match(/data-platform55-sidebar(?:\s|>)/g) || []).length, 1, `${file} must expose one tenant sidebar host`);
  assert.equal((html.match(/data-platform55-topbar(?:\s|>)/g) || []).length, 1, `${file} must expose one tenant topbar host`);
  assert.equal((html.match(/data-platform55-page-content(?:\s|>)/g) || []).length, 1, `${file} must expose one page-state host`);
  assert.equal((html.match(/<main\b/g) || []).length, 1, `${file} must retain one main landmark`);
  assert.doesNotMatch(html, /class="[^"]*\b(?:shell-layout|side-nav|nav-groups)\b/, `${file} must remove the legacy navigation shell`);
}

const publicHtml = readFileSync("shipper-profile.html", "utf8");
assert.equal((publicHtml.match(/data-platform55-shell="public"/g) || []).length, 1, "shipper-profile.html must use the public shell once");
assert.equal((publicHtml.match(/data-platform55-page="shipper-profile"/g) || []).length, 1, "shipper-profile.html must publish its route key once");
assert.equal((publicHtml.match(/platform55-tokens\.css/g) || []).length, 1, "shipper-profile.html must include shared tokens once");
assert.equal((publicHtml.match(/platform55-public-shell\.css/g) || []).length, 1, "shipper-profile.html must include public shell CSS once");
assert.equal((publicHtml.match(/platform55-network-service\.css/g) || []).length, 1, "shipper-profile.html must include network/service CSS once");
assert.equal((publicHtml.match(/data-platform55-public-app(?:\s|>)/g) || []).length, 1, "shipper-profile.html must expose one public app host");
assert.ok((publicHtml.match(/data-platform55-public-context(?:\s|>)/g) || []).length >= 1, "shipper-profile.html must expose public organization context");
assert.ok((publicHtml.match(/data-platform55-public-state(?:\s|>)/g) || []).length >= 1, "shipper-profile.html must expose a signed-out/loading/error boundary");
assert.equal((publicHtml.match(/<main\b/g) || []).length, 1, "shipper-profile.html must retain one main landmark");
assert.doesNotMatch(
  publicHtml,
  /data-platform55-(?:sidebar|topbar)|(?:href|src)="[^"]*(?:settings|upload-center|staging-review|business-intelligence)\.html|\bAsk AI\b|notification center/i,
  "shipper-profile.html must not expose private tenant navigation or search"
);

assert.match(networkCss, /\.rw-network-service-table-scroll[\s\S]*overflow-x:\s*auto/, "Network/service tables must contain horizontal overflow");
assert.match(networkCss, /\.rw-network-service-page\s*>\s*\*\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s, "Every direct network/service workspace region must shrink inside the shell");
assert.match(networkCss, /\.rw-network-service-page\s+\.shipper-view-switcher\s*\{[^}]*width:\s*100%[^}]*overflow-x:\s*auto/s, "The Shipper CRM view switcher must scroll inside the mobile viewport");

console.log("Platform55 network/service route adoption contract passed.");
