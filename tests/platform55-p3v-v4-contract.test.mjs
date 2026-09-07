import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  P3V4_SOURCE_PATHS,
  loadP3V4SourceSupersession,
  validateP3V4SourceGitState,
} from "../tools/platform55-p3v4-source-supersession.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const routes = Object.freeze({
  "shipper-crm.html": "shipper-crm",
  "vendor-support.html": "vendor-support",
  "vendor-improvement.html": "vendor-improvement",
  "provider-service.html": "provider-service",
  "provider-onboarding.html": "provider-onboarding",
  "provider-gmail.html": "provider-gmail",
  "provider-communications.html": "provider-communications",
});

test("P3-V4 covers exactly the seven network and service routes", async () => {
  for (const [path, route] of Object.entries(routes)) {
    const source = await read(path);
    assert.match(source, /platform55-visual-parity\.css/, path);
    assert.match(source, new RegExp(`data-p3v4-route="${route}"`), path);
    assert.match(source, /class="[^"]*p55-v4-page/, path);
    assert.equal((source.match(/data-platform55-page-content/g) || []).length, 1, path);
  }
});

test("P3-V4 keeps the operating boundary visible on every route", async () => {
  for (const [path, route] of Object.entries(routes)) {
    const source = await read(path);
    assert.match(source, /class="p55-v4-context-banner"/, path);
    assert.match(source, /data-p3v4-boundary/, `${path}:${route}:boundary-hook`);
    assert.match(source, /human|approval|read-only|governed|confirmation/i, `${path}:${route}:boundary-copy`);
  }
});

test("P3-V4 visual layer defines MARKSMAN roles, focus, and responsive safety", async () => {
  const parity = await read("src/platform55-visual-parity.css");
  const network = await read("src/platform55-network-service.css");
  for (const token of ["#1e1e1e", "#ea5e27", "#484848", "#efefef"]) assert.match(parity, new RegExp(token.replace("#", "\\#")), token);
  assert.match(parity, /\.p55-v4-context-banner/);
  assert.match(parity, /focus-visible/);
  assert.match(network, /provider-service-master-detail/);
  assert.match(network, /onboarding-master-detail/);
  assert.match(network, /communications-master-detail/);
  assert.match(network, /@media \(max-width: 900px\)/);
  assert.match(network, /@media \(max-width: 520px\)/);
  assert.doesNotMatch(parity, /!important/);
  assert.doesNotMatch(network, /!important/);
});

test("P3-V4 does not expose autonomous messaging, activation, or production insertion", async () => {
  const source = await Promise.all(Object.keys(routes).map(read));
  const combined = source.join("\n");
  assert.match(combined, /human|read-only|confirmation|approval|governed/i);
  assert.doesNotMatch(combined, /auto(?:matic|matically)[^\n]{0,100}(?:send|insert|approve|activate)/i);
  assert.doesNotMatch(combined, /without[^\n]{0,80}(?:confirmation|approval)[^\n]{0,80}(?:send|activate|insert)/i);
});

test("P3-V4 source supersession is content-addressed and keeps credit withheld", () => {
  const record = loadP3V4SourceSupersession();
  assert.equal(record.verdict, "LOCAL-GO");
  assert.equal(record.release_credit, "withheld");
  assert.deepEqual(record.source_paths, P3V4_SOURCE_PATHS);
  assert.equal(validateP3V4SourceGitState(process.cwd(), record), record);
});
