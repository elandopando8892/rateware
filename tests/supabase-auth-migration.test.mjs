import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("../supabase/functions/_shared/auth.ts", import.meta.url), "utf8");

test("private Rateware APIs accept only Supabase Auth", () => {
  assert.doesNotMatch(authSource, /Kinde|RATEWARE_AUTH_PROVIDER|dual/i);
  assert.match(authSource, /return requireSupabaseUser\(token\)/);
});

test("Supabase tokens are verified by Auth before claims are trusted", () => {
  assert.match(authSource, /\/auth\/v1\/user/);
  assert.match(authSource, /if \(!response\.ok\) throw/);
  assert.match(authSource, /appMetadata\.rateware_organization_id/);
  assert.doesNotMatch(authSource, /user_metadata.*organization/i);
});

test("unverified JWT claims are never used for verifier selection", () => {
  assert.doesNotMatch(authSource, /jwtPayload|\.iss|atob/);
});

test("canonical tenant resolution rejects legacy providers", async () => {
  const { normalizeVerifiedIdentity } = await import("../supabase/functions/_shared/identity-contract.mjs");
  assert.throws(
    () => normalizeVerifiedIdentity({ auth_provider: "kinde", sub: "legacy", organization_id: "legacy" }),
    (error) => error.code === "IDENTITY_PROVIDER_UNSUPPORTED"
  );
});
