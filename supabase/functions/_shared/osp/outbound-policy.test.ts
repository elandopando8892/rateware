import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import {
  type OutboundCaseContext,
  requireCurrentOutboundPolicy,
} from "./outbound-policy.ts";
import type { OutboundDraft } from "./outbound-payload.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const packageId = "44444444-4444-4444-8444-444444444444";
const messageId = "<supplier-request@example.test>";
const xlsx =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;

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
    inReplyTo: kind === "final_response" ? messageId : null,
    references: kind === "final_response" ? [messageId] : [],
    bodyText: "Synthetic body",
    attachments: kind === "final_response"
      ? [{
        bucketId: "osp-derived-documents",
        objectId: packageId,
        name: "XBF-signed-supplier-package.xlsx",
        contentType: xlsx,
        sha256: "b".repeat(64),
      }]
      : [],
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
    signedPackageId: kind === "final_response" ? packageId : null,
    signedPackageContentType: kind === "final_response" ? xlsx : null,
    gmailThreadId: kind === "final_response" ? "gmail-thread-1" : null,
    replyContext: kind === "final_response"
      ? {
        to: ["supplier@example.test"],
        cc: [],
        subject: "Synthetic subject",
        inReplyTo: messageId,
        references: [messageId],
      }
      : null,
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
      { ...current, signedPackageId: "55555555-5555-4555-8555-555555555555" },
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
  assertThrows(
    () => requireCurrentOutboundPolicy({
      ...finalDraft,
      attachments: finalDraft.attachments.map((attachment) => ({
        ...attachment,
        objectId: "55555555-5555-4555-8555-555555555555",
      })),
    }, current),
    Error,
    "OUTBOUND_CONTEXT_STALE",
  );
});
