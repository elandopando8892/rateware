import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/auth.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(nextName, start + 1);
  assert.ok(start >= 0, `${name} should exist`);
  return source.slice(start, end >= 0 ? end : undefined);
}

test("ensureSignedIn reuses one Kinde token for session and access context", () => {
  const ensureSource = functionSource("ensureSignedIn", "function accessContextFromToken");
  assert.equal((ensureSource.match(/getKindeToken\(/g) || []).length, 1);
  assert.match(ensureSource, /access: accessContextFromToken\(token\)/);
  assert.doesNotMatch(ensureSource, /getAccessContext\(\)/);
});

test("getAccessContext keeps the public token-derived access contract", () => {
  assert.match(source, /function accessContextFromToken\(token\)[\s\S]*roles:[\s\S]*permissions:/);
  assert.match(source, /export async function getAccessContext\(\) \{\s*return accessContextFromToken\(await getKindeToken\(\)\);\s*\}/);
});
