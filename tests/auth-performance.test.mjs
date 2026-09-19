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

test("ensureSignedIn reuses one Supabase session for token, user, and access context", () => {
  const ensureSource = functionSource("ensureSignedIn", "export async function getAccessContext");
  assert.equal((ensureSource.match(/getSession\(/g) || []).length, 1);
  assert.match(ensureSource, /token: active\.access_token/);
  assert.match(ensureSource, /user: active\.user/);
  assert.match(ensureSource, /access: accessContext\(active\.user\)/);
  assert.doesNotMatch(ensureSource, /getAccessContext\(\)/);
});

test("getAccessContext uses server-managed Supabase app metadata", () => {
  const start = source.indexOf("function accessContext(user)");
  const end = source.indexOf("export async function ensureSignedIn", start);
  assert.ok(start >= 0 && end > start);
  const accessSource = source.slice(start, end);
  assert.match(accessSource, /user\?\.app_metadata/);
  assert.match(accessSource, /roles: metadata\.roles/);
  assert.match(accessSource, /permissions: metadata\.permissions/);
  assert.doesNotMatch(accessSource, /user_metadata/);
  assert.match(source, /export async function getAccessContext\(\) \{ return \(await ensureSignedIn\(\)\)\.access; \}/);
});

test("frontend configuration and deployment smoke expose no Kinde contract", () => {
  const surfaces = [
    "../src/config.js",
    "../src/config.example.js",
    "../src/error-copy.js",
    "../tools/integration-smoke.mjs",
  ].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(surfaces, /kinde|getKindeToken|kindeClient/i);
  assert.match(surfaces, /SUPABASE_URL/);
  assert.match(surfaces, /RATEWARE_E2E_AUTH_TOKEN/);
});
