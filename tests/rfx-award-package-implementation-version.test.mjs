import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260907120000_rfx_award_package_implementation_version.sql", "utf8");
const api = readFileSync("supabase/functions/rateware-api/index.ts", "utf8");
const service = readFileSync("src/rfx-process-service.js", "utf8");
const client = readFileSync("src/rfx-process.js", "utf8");
const errorCopy = readFileSync("src/error-copy.js", "utf8");

test("award package implementation transitions have a durable version column", () => {
  assert.match(migration, /add column if not exists version bigint not null default 1/);
  assert.match(migration, /rfx_award_packages_version_check/);
  assert.match(migration, /check \(version >= 1\)/);
});

test("implementation-ready action requires and atomically advances expected version", () => {
  assert.match(api, /rfxAwardPackageExpectedVersion\(input\.expected_version\)/);
  assert.match(api, /expected_version is required/);
  assert.match(api, /version: expectedVersion \+ 1/);
  assert.match(api, /\.eq\("version", expectedVersion\)[\s\S]+\.maybeSingle\(\)/);
  assert.match(api, /RFx award package changed since it was loaded/);
  assert.match(api, /code: "409"/);
});

test("RFx Process sends the loaded award version back to the guarded action", () => {
  assert.match(service, /markRfxAwardPackageImplementationReady\(awardPackageId, expectedVersion\)/);
  assert.match(service, /expected_version: expectedVersion/);
  assert.match(client, /data-award-version="\$\{escapeHtml\(Number\(row\.version\) \|\| 1\)\}"/);
  assert.match(client, /markRfxAwardPackageImplementationReady\(target\.dataset\.awardId, Number\(target\.dataset\.awardVersion\) \|\| 1\)/);
});

test("stale award transitions have a recoverable user-facing message", () => {
  assert.match(errorCopy, /changed since it was loaded/);
  assert.match(errorCopy, /Refresh the page and review the latest version/);
});
