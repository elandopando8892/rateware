import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { safeTokenFailureReason, withGmailDependencyStage } from "./dependency-stage.ts";

Deno.test("dependency stage passes through success without logging", async () => {
  const events: string[] = [];
  assertEquals(await withGmailDependencyStage("connection", async () => 7, (event) => events.push(event)), 7);
  assertEquals(events, []);
});
Deno.test("dependency stage logs no error content and preserves failure", async () => {
  const events: string[] = [];
  const failure = new Error("private-token private-mailbox private-provider-response");
  const caught = await assertRejects(() => withGmailDependencyStage("access_token", () => Promise.reject(failure), (event) => events.push(event)));
  assertEquals(caught, failure);
  assertEquals(events, ['{"event":"OSP_GMAIL_DEPENDENCY_FAILED","stage":"access_token","reason":"unclassified"}']);
});

Deno.test("token diagnostic recognizes only exact safe codes", () => {
  assertEquals(safeTokenFailureReason(new Error("Token has been expired or revoked.")), "google_grant_expired_or_revoked");
  assertEquals(safeTokenFailureReason(new DOMException("private", "OperationError")), "cryptographic_operation_failed");
  for (const value of [new Error("invalid_grant secret"), new Error("toString"), new Error("__proto__"), {message:"invalid_grant"}, null]) {
    assertEquals(safeTokenFailureReason(value), "unclassified");
  }
});
Deno.test("broken logger cannot mask dependency failure", async () => {
  const failure = new Error("original");
  const caught = await assertRejects(() => withGmailDependencyStage("historical_search", () => Promise.reject(failure), () => { throw new Error("logger"); }));
  assertEquals(caught, failure);
});
