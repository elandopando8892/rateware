import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const routes = Object.freeze({
  "vendors.html": "vendors",
  "rfx-process.html": "rfx-process",
  "rfx-events.html": "rfx-events",
  "ratebook.html": "ratebook",
  "outreach.html": "outreach",
});

test("P3-V3 covers exactly the procurement and carrier lifecycle routes", async () => {
  for (const [path, route] of Object.entries(routes)) {
    const source = await read(path);
    assert.match(source, /platform55-visual-parity\.css/, path);
    assert.match(source, new RegExp(`data-p3v3-route="${route}"`), path);
    assert.match(source, /class="[^"]*p55-v3-page/, path);
    assert.equal((source.match(/data-platform55-page-content/g) || []).length, 1, path);
  }
});

test("P3-V3 keeps a visible workspace boundary on every route", async () => {
  for (const [path, route] of Object.entries(routes)) {
    const source = await read(path);
    assert.match(source, /class="p55-v3-context-banner"/, path);
    assert.match(source, new RegExp(`data-p3v3-boundary="[^"]+"`), path);
    assert.match(source, /human|approval|draft|propuesta|confirm/i, `${path}:${route}:boundary-copy`);
  }
});

test("P3-V3 visual layer defines MARKSMAN roles and responsive safety", async () => {
  const parity = await read("src/platform55-visual-parity.css");
  for (const token of ["#1e1e1e", "#ea5e27", "#484848", "#efefef"]) assert.match(parity, new RegExp(token.replace("#", "\\#")), token);
  assert.match(parity, /\.p55-v3-context-banner/);
  assert.match(parity, /overflow-x:\s*auto/);
  assert.match(parity, /@media \(max-width: 900px\)/);
  assert.match(parity, /@media \(max-width: 520px\)/);
  assert.match(parity, /prefers-reduced-motion/);
  assert.doesNotMatch(parity, /!important/);
});

test("P3-V3 does not expose an automatic delivery or production insert path", async () => {
  const source = await Promise.all(Object.keys(routes).map(read));
  const combined = source.join("\n");
  assert.match(combined, /Nothing is sent without an explicit confirmation|external delivery stays human-confirmed|approval remains explicit/i);
  assert.doesNotMatch(combined, /auto(?:matic|matically)[^\n]{0,80}(?:send|insert|approve)/i);
});

