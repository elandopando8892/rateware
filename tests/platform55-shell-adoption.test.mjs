import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("unterminated CSV field");
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  const header = rows.shift();
  assert.ok(header?.length, "route map header is required");
  assert.equal(rows.every((entry) => entry.length === header.length), true, "route rows must match the header");
  return rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])));
}

const escapeRegex = (value) => value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
const routes = parseCsv(readFileSync("docs/platform55-shell-route-map.csv", "utf8"));
const rootHtml = readdirSync(".", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => entry.name)
  .sort();
const expectedHtml = routes.map((row) => row.route).sort();

assert.equal(routes.length, 29);
assert.equal(routes.filter((row) => row.shell_variant === "tenant").length, 22);
assert.equal(routes.filter((row) => row.shell_variant === "public").length, 6);
assert.equal(routes.filter((row) => row.shell_variant === "entry").length, 1);
assert.deepEqual(rootHtml, expectedHtml, "every tracked root HTML page must have one frozen route record");

for (const row of routes) {
  const html = readFileSync(row.route, "utf8");
  assert.equal((html.match(/<body\b/g) || []).length, 1, `${row.route} must have one body shell host`);
  assert.match(html, new RegExp(`<body[^>]*data-platform55-shell=["']${row.shell_variant}["'][^>]*data-platform55-page=["']${row.page_key}["']`), `${row.route} shell identity mismatch`);
  assert.equal((html.match(/<main\b/g) || []).length, 1, `${row.route} must expose exactly one main landmark`);
  assert.equal(/class=["'][^"']*side-nav|class=["'][^"']*nav-groups/.test(html), false, `${row.route} must not retain legacy global navigation`);
  assert.match(html, /src\/platform55-tokens\.css/, `${row.route} must consume Platform55 tokens`);
  if (row.shell_variant === "tenant") {
    assert.equal((html.match(/data-platform55-app/g) || []).length, 1, `${row.route} must expose one tenant shell root`);
    assert.match(html, /src\/platform55-shell\.css/, `${row.route} must consume the tenant shell stylesheet`);
  } else {
    assert.match(html, /src\/platform55-public-shell\.css/, `${row.route} must consume the public shell stylesheet`);
    assert.equal(/data-platform55-sidebar|data-platform55-topbar/.test(html), false, `${row.route} cannot expose private shell controls`);
  }
  for (const modulePath of row.module_script.split(";").filter(Boolean)) {
    assert.match(html, new RegExp(escapeRegex(modulePath)), `${row.route} must load ${modulePath}`);
  }
}

const auth = readFileSync("src/auth.js", "utf8");
for (const marker of [
  "SHELL_NAV_GROUPS",
  "PAGE_META",
  "initLegacySaasShell",
  "initCommandPalette",
  "initFocusMode",
  "initShellNavigation",
  "initShellHeader",
  "SHELL_NAV_COLLAPSED_KEY",
  "SHELL_FOCUS_MODE_KEY",
]) {
  assert.equal(auth.includes(marker), false, `src/auth.js must retire legacy shell owner ${marker}`);
}
assert.match(auth, /mountPlatform55Shell\(\{ pageKey: document\.body\.dataset\.platform55Page \}\)/);
assert.doesNotMatch(auth, /document\.querySelector\(["']\.side-nav/);

const styles = readFileSync("src/styles.css", "utf8");
for (const selector of [
  ".side-nav",
  ".shell-layout",
  ".shell-quick-open",
  ".command-palette",
  ".shell-focus-toggle",
  ".shell-focus-mode",
  ".shell-nav-collapsed",
  ".shell-status-strip",
]) {
  assert.equal(styles.includes(selector), false, `src/styles.css must retire legacy shell selector ${selector}`);
}

console.log("Platform55 full shell adoption contract passed: 22 tenant, 6 public, 1 entry.");
