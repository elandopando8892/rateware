import { createFollowUpToken, verifyFollowUpToken } from "./follow-up-token.ts";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

const secret = "test-secret-material-with-at-least-thirty-two-characters";
const receipt = "11111111-2222-4333-8444-555555555555";

Deno.test("follow-up token carries only an encrypted receipt and expires", async () => {
  const token = await createFollowUpToken(secret, receipt, 1_000, 5_000);
  assert(!token.includes(receipt), "receipt must not be visible in the URL token");
  const valid = await verifyFollowUpToken(secret, token, 5_999);
  assert(valid.ok && valid.receiptId === receipt, "valid token must resolve the receipt");
  const expired = await verifyFollowUpToken(secret, token, 6_000);
  assert(!expired.ok && expired.code === "follow_up_expired", "expired token must be rejected");
});

Deno.test("follow-up token rejects tampering and another key", async () => {
  const token = await createFollowUpToken(secret, receipt);
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert(!(await verifyFollowUpToken(secret, tampered)).ok, "tampered token must be rejected");
  assert(!(await verifyFollowUpToken(`${secret}-different`, token)).ok, "another key must not decrypt token");
});
