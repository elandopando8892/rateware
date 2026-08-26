import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import {
  type OutboundCaseContext,
  requireCurrentOutboundPolicy,
} from "./outbound-policy.ts";
import type { OutboundDraft } from "./outbound-payload.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";

function draft(kind: OutboundDraft["kind"]): OutboundDraft {
  return {
    payloadId: "33333333-3333-4333-8333-333333333333",
    organizationId,
    caseId,
    kind,
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: kind === "final_response" ? "b".repeat(64) : null,
    from: "carriers@xbfreight.com",
    to: [{ email: "supplier@example.test", source: "captured_supplier" }],
    cc: [],
    subject: "Synthetic subject",
    inReplyTo: null,
    references: [],
    bodyText: "Synthetic body",
    attachments: [],
  };
}

function context(kind: OutboundDraft["kind"]): OutboundCaseContext {
  return {
    organizationId,
    caseId,
    state: kind === "clarification"
      ? "awaiting_clarification"
      : "sales_authorization",
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: kind === "final_response" ? "b".repeat(64) : null,
  };
}

Deno.test("current policy accepts clarification and signed final response as distinct workflows", () => {
  for (const kind of ["clarification", "final_response"] as const) {
    assertEquals(
      requireCurrentOutboundPolicy(draft(kind), context(kind)),
      context(kind),
    );
  }
});

Deno.test("current policy rejects stale case, stale source, stale signed package, wrong state, and unsigned final response", () => {
  const finalDraft = draft("final_response");
  const current = context("final_response");
  for (
    const candidate of [
      { ...current, caseVersion: 8 },
      { ...current, sourceSnapshotSha256: "c".repeat(64) },
      { ...current, signedPackageSha256: "d".repeat(64) },
      { ...current, state: "awaiting_clarification" },
    ]
  ) {
    assertThrows(
      () =>
        requireCurrentOutboundPolicy(
          finalDraft,
          candidate as OutboundCaseContext,
        ),
      Error,
      "OUTBOUND_CONTEXT_STALE",
    );
  }
  assertThrows(
    () =>
      requireCurrentOutboundPolicy(
        { ...finalDraft, signedPackageSha256: null },
        current,
      ),
    Error,
    "OUTBOUND_CONTEXT_STALE",
  );
});
