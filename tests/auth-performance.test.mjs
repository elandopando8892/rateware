import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/auth.js", import.meta.url), "utf8");

test("Supabase owns browser session persistence and refresh", () => {
  assert.match(source, /persistSession: true/);
  assert.match(source, /autoRefreshToken: true/);
  assert.match(source, /authClient\.auth\.getSession\(\)/);
  assert.match(source, /authClient\.auth\.refreshSession\(\)/);
});

test("access context comes only from server-managed app metadata", () => {
  assert.match(source, /const metadata = user\?\.app_metadata \|\| \{\}/);
  assert.doesNotMatch(source, /user_metadata[^\n]+roles|user_metadata[^\n]+permissions/);
});

test("the browser runtime contains no Kinde fallback", () => {
  assert.doesNotMatch(source, /Kinde|getKinde|kinde/i);
});
