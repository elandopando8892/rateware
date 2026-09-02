import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { summarizeSupervisedSession } from "./rfx-private-resolver-supervised-session-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [raw, runbook, runner, packageRaw] = await Promise.all([
  read("docs/rfx-private-resolver-supervised-session.json"),
  read("docs/rfx-private-resolver-supervised-session-runbook.md"),
  read("tools/run-rfx-private-resolver-supervised-session.ps1"),
  read("package.json"),
]);
const summary = summarizeSupervisedSession(JSON.parse(raw));

assert.match(runbook, /different named observer/i);
assert.match(runbook, /every 15 minutes/i);
assert.match(runbook, /Do not retry an ambiguous canary request/i);
assert.match(runner, /network-restrictions get --experimental/);
assert.match(runner, /functions list/);
assert.match(runner, /configure-rfx-private-resolver-staging\.ps1/);
assert.match(runner, /disable-rfx-private-resolver-staging\.ps1/);
assert.ok(JSON.parse(packageRaw).scripts["test:release:private-resolver"].includes("test:supervised-session"));
assert.doesNotMatch(raw + runbook + runner, /eyJ[A-Za-z0-9_-]{40,}/);
assert.doesNotMatch(raw + runbook + runner, /postgres(?:ql)?:\/\/[^\s]+@/i);
assert.doesNotMatch(raw, /\b(?:\d{1,3}\.){3}\d{1,3}\/32\b/);

console.log(JSON.stringify({ status:"PASS", ...summary }, null, 2));
