import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLATFORM55_ROUTES,
  routeForPath,
  visibleNavigation,
  shellModel
} from "../src/platform55-shell-model.js";

const css = readFileSync("src/platform55-tokens.css", "utf8");
const operatePlan = readFileSync(
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s2-operate.md",
  "utf8"
);
const procurementPlan = readFileSync(
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s3-procurement.md",
  "utf8"
);
const expectedTokens = [
  ["--rw-brand-50", "#eef2ff"],
  ["--rw-brand-100", "#e0e7ff"],
  ["--rw-brand-500", "#3f5bd8"],
  ["--rw-brand-600", "#334bc3"],
  ["--rw-brand-700", "#293ea6"],
  ["--rw-navy-800", "#173047"],
  ["--rw-navy-900", "#10263a"],
  ["--rw-navy-950", "#0b1d2d"],
  ["--rw-teal-50", "#ecf8f5"],
  ["--rw-teal-500", "#2d9c88"],
  ["--rw-teal-700", "#207362"],
  ["--rw-amber-50", "#fff8e8"],
  ["--rw-amber-500", "#e7a43a"],
  ["--rw-amber-700", "#a9670f"],
  ["--rw-red-50", "#fff1f1"],
  ["--rw-red-500", "#d65757"],
  ["--rw-red-700", "#a83838"],
  ["--rw-slate-25", "#fbfcfe"],
  ["--rw-slate-50", "#f6f8fb"],
  ["--rw-slate-100", "#edf1f6"],
  ["--rw-slate-200", "#dde4ec"],
  ["--rw-slate-300", "#c8d2de"],
  ["--rw-slate-400", "#94a2b1"],
  ["--rw-slate-500", "#68788a"],
  ["--rw-slate-600", "#4b5d6f"],
  ["--rw-slate-700", "#344556"],
  ["--rw-slate-800", "#223343"],
  ["--rw-slate-900", "#142334"],
  ["--rw-white", "#fff"],
  ["--rw-sidebar-expanded", "264px"],
  ["--rw-sidebar-collapsed", "80px"],
  ["--rw-topbar", "64px"],
  ["--rw-radius-sm", "6px"],
  ["--rw-radius-md", "10px"],
  ["--rw-radius-lg", "14px"],
  ["--rw-radius-xl", "18px"],
  ["--rw-shadow-sm", "0 1px 2px rgba(15, 35, 55, 0.06)"],
  ["--rw-shadow-md", "0 12px 28px rgba(15, 35, 55, 0.10)"],
  ["--rw-shadow-drawer", "-18px 0 40px rgba(15, 35, 55, 0.18)"],
  ["--rw-motion-fast", "160ms"],
  ["--rw-motion-easing", "cubic-bezier(0.2, 0.7, 0.2, 1)"],
  ["--rw-motion-none", "0ms"],
  ["--rw-breakpoint-wide", "1500px"],
  ["--rw-breakpoint-compact", "1320px"],
  ["--rw-breakpoint-mobile", "900px"]
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const [name, value] of expectedTokens) {
  assert.match(css, new RegExp(`${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i"));
}

assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
assert.match(css, /--rw-motion-fast:\s*var\(--rw-motion-none\)/i);
assert.doesNotMatch(css, /url\s*\(|@import|javascript\s*:/i);

assert.doesNotMatch(operatePlan, /test:platform55:shell|--p55-/);
assert.equal(operatePlan.match(/npm run test:platform55-shell/g)?.length, 2);
assert.doesNotMatch(procurementPlan, /--p55-|not_verified/);
assert.match(procurementPlan, /state without evidence remains `not_started`/);

const routeMapFiles = readFileSync("docs/platform55-shell-route-map.csv", "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((row) => row.split(",", 1)[0])
  .sort();
const registeredFiles = PLATFORM55_ROUTES.map((row) => row.path.replace(/^\.\//, "")).sort();

assert.equal(PLATFORM55_ROUTES.length, 29);
assert.equal(PLATFORM55_ROUTES.filter((row) => row.shell === "tenant").length, 22);
assert.equal(PLATFORM55_ROUTES.filter((row) => row.shell !== "tenant").length, 7);
assert.deepEqual(registeredFiles, routeMapFiles);
assert.equal(routeForPath("/app")?.key, "app");
assert.equal(routeForPath("/app.html")?.key, "app");
assert.equal(routeForPath("/rfx-bid")?.shell, "public");
assert.equal(routeForPath("/missing"), null);

assert.equal(new Set(PLATFORM55_ROUTES.map((row) => row.key)).size, PLATFORM55_ROUTES.length);
assert.equal(new Set(PLATFORM55_ROUTES.map((row) => row.path)).size, PLATFORM55_ROUTES.length);
for (const route of PLATFORM55_ROUTES) {
  assert.ok(Object.isFrozen(route));
  assert.match(route.path, /^\.\/[a-z0-9-]+\.html$/);
  assert.doesNotMatch(route.path, /:\/\/|^\/\//);
  if (route.shell === "tenant") {
    assert.ok(route.group);
    assert.ok(route.icon);
    assert.ok(route.title);
    assert.ok(route.subtitle);
  }
}
assert.ok(Object.isFrozen(PLATFORM55_ROUTES));

const restricted = visibleNavigation({ can: () => false });
assert.ok(restricted.every((item) => item.requiredAction == null));
assert.ok(restricted.every((item) => item.shell === "tenant"));
assert.ok(restricted.every((item) => !["rfx-bid", "carrier-profile", "shipper-profile"].includes(item.key)));

const model = shellModel({
  pageKey: "app",
  user: { given_name: "<Andre>" },
  accessContext: { can: () => true },
  notificationSummary: { unread: 3 }
});
assert.equal(model.activeRoute.key, "app");
assert.equal(model.notificationCount, 3);
assert.doesNotMatch(JSON.stringify(model), /<Andre>/);

const iconSource = readFileSync("src/platform55-icons.js", "utf8");
assert.match(iconSource, /registerPlatform55Icons/);
assert.match(iconSource, /customElements\.define/);
assert.match(iconSource, /rw-i-/);
assert.doesNotMatch(iconSource, /innerHTML\s*=\s*[^;]*(getAttribute|name)/);
assert.doesNotMatch(iconSource, /javascript:/i);
assert.doesNotMatch(iconSource, /href\s*=\s*["']https?:/i);

const appHtml = readFileSync("app.html", "utf8");
const authSource = readFileSync("src/auth.js", "utf8");
const shellSource = readFileSync("src/platform55-shell.js", "utf8");
const shellCss = readFileSync("src/platform55-shell.css", "utf8");

assert.match(appHtml, /data-platform55-shell="tenant"/);
assert.match(appHtml, /data-platform55-page="app"/);
assert.match(appHtml, /platform55-tokens\.css/);
assert.match(appHtml, /platform55-shell\.css/);
assert.doesNotMatch(appHtml, /<aside class="side-nav"/);
assert.equal((appHtml.match(/id="auth-form"/g) || []).length, 1);
assert.match(authSource, /mountPlatform55Shell/);
assert.match(authSource, /dataset\.platform55Shell === "tenant"/);
assert.match(authSource, /initLegacySaasShell/);
assert.doesNotMatch(shellSource, /fetch\(|authenticatedFetch|supabase|localStorage\.clear/i);
assert.match(shellSource, /export function mountPlatform55Shell/);
assert.match(shellSource, /export function updatePlatform55Shell/);
assert.match(shellSource, /export function unmountPlatform55Shell/);
assert.match(shellCss, /grid-template-columns:\s*var\(--rw-sidebar-expanded\)\s+minmax\(0,\s*1fr\)/);
assert.match(shellCss, /@media\s*\(max-width:\s*1320px\)/);
assert.match(shellCss, /@media\s*\(max-width:\s*900px\)/);
assert.match(shellCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
