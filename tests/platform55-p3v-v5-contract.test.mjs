import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PLATFORM55_ROUTES } from "../src/platform55-shell-model.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const INTELLIGENCE = Object.freeze(["business-intelligence.html", "growth-hacking.html"]);
const ADMINISTRATION = Object.freeze(["settings.html", "interpretation-memory.html", "catalog-workbench.html"]);
const PUBLIC = Object.freeze([
  "bid-room-board.html",
  "carrier-profile.html",
  "customer-rfi.html",
  "index.html",
  "ratebook-carrier.html",
  "rfx-bid.html",
  "shipper-profile.html",
]);

const ROUTE_KEYS = Object.freeze({
  "business-intelligence.html": "business-intelligence",
  "growth-hacking.html": "growth-hacking",
  "settings.html": "settings",
  "interpretation-memory.html": "interpretation-memory",
  "catalog-workbench.html": "catalog-workbench",
  "bid-room-board.html": "bid-room-board",
  "carrier-profile.html": "carrier-profile",
  "customer-rfi.html": "customer-rfi",
  "index.html": "index",
  "ratebook-carrier.html": "ratebook-carrier",
  "rfx-bid.html": "rfx-bid",
  "shipper-profile.html": "shipper-profile",
});

test("P3-V5 covers exactly the twelve intelligence, admin, and public routes", async () => {
  const routes = [...INTELLIGENCE, ...ADMINISTRATION, ...PUBLIC];
  assert.equal(routes.length, 12);
  assert.equal(new Set(routes).size, 12);
  for (const route of routes) {
    const html = await read(route);
    const key = ROUTE_KEYS[route];
    const model = PLATFORM55_ROUTES.find((candidate) => candidate.key === key);
    assert.ok(model, `${route} must exist in the frozen shell model`);
    assert.match(html, new RegExp(`data-platform55-page=["']${key}["']`));
    assert.match(html, new RegExp(`data-p3v5-family=["']${model.shell === "tenant" ? (INTELLIGENCE.includes(route) ? "intelligence" : "administration") : (key === "index" ? "entry" : "public")}["']`));
    assert.match(html, /p55-v5-page/);
    assert.match(html, /data-p3v5-boundary=/);
  }
});

test("P3-V5 keeps evidence, governance, and public boundary contracts visible", async () => {
  for (const route of INTELLIGENCE) {
    const html = await read(route);
    assert.match(html, /data-platform55-evidence-summary/);
    assert.match(html, /data as of/i);
    assert.match(html, /gaps/i);
    assert.match(html, /proposal|recommend/i);
    assert.match(html, /confirmation required|confirm/i);
  }
  for (const route of ADMINISTRATION) {
    const html = await read(route);
    assert.match(html, /data-platform55-governance-summary/);
    assert.match(html, /read-only|review required|blocked/i);
    assert.match(html, /scoped|audit|confirmation/i);
  }
  for (const route of PUBLIC) {
    const html = await read(route);
    assert.match(html, /data-platform55-public-context/);
    assert.doesNotMatch(html, /data-platform55-sidebar|data-platform55-topbar|class=["'][^"']*rw-nav-link/i);
    assert.match(html, /private|public|signed|tenant data|invitation|draft/i);
    if (route === "index.html") assert.match(html, /illustrative preview/i);
    else assert.match(html, /data-platform55-public-state/);
  }
});

test("P3-V5 visual layers use MARKSMAN roles, focus states, and responsive containment", async () => {
  const parity = await read("src/platform55-visual-parity.css");
  const admin = await read("src/platform55-intelligence-admin.css");
  const publicCss = await read("src/platform55-public.css");
  for (const token of ["#1e1e1e", "#ea5e27", "#484848", "#efefef"]) assert.match(parity, new RegExp(token.replace("#", "\\#")), token);
  assert.match(parity, /\.p55-v5-page/);
  assert.match(parity, /\.p55-v5-context-banner/);
  assert.match(parity, /focus-visible/);
  assert.match(parity, /overflow-wrap|overflow-x/);
  assert.match(parity, /@media \(max-width: 900px\)/);
  assert.match(parity, /@media \(max-width: 520px\)/);
  assert.match(parity, /prefers-reduced-motion/);
  assert.match(admin, /\.p55-v5-page--intelligence/);
  assert.match(admin, /\.p55-v5-page--administration/);
  assert.match(publicCss, /\.p55-v5-page--public/);
  assert.match(publicCss, /\.p55-v5-page--entry/);
  assert.match(publicCss, /private|tenant|invitation/i);
  assert.doesNotMatch(admin, /#[0-9a-f]{3,8}\b/i, "family CSS must consume shared MARKSMAN variables");
});

test("P3-V5 does not add autonomous messaging, activation, or production writes", async () => {
  const source = await Promise.all([...INTELLIGENCE, ...ADMINISTRATION, ...PUBLIC].map(read));
  const combined = source.join("\n");
  assert.doesNotMatch(combined, /automatically[^\n]{0,100}(?:send|activate|insert|approve)/i);
  assert.doesNotMatch(combined, /without[^\n]{0,80}(?:confirmation|approval)[^\n]{0,80}(?:send|activate|insert)/i);
});

console.log("Platform55 P3-V5 route contract passed.");
