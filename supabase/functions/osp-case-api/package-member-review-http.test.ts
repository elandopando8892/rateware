// deno-lint-ignore no-import-prefix
import { assertEquals } from "jsr:@std/assert@1.0.14";
import { createCaseApiHandler } from "./handler.ts";
import type { SavePackageMemberReviewCommand } from "./package-member-review-store.ts";
const id = "11111111-1111-4111-8111-111111111111";
const input = {
  reviewId: id,
  caseId: id,
  setId: id,
  sourceVersionId: id,
  expectedCaseVersion: 7,
  inputSnapshotSha256: "a".repeat(64),
  setManifestSha256: "b".repeat(64),
  requestManifestSha256: "c".repeat(64),
  outputSha256: "d".repeat(64),
  status: "approved",
  fullOutputInspected: true,
  completionPercent: 100,
  pageCount: 2,
  signatureRequirement: "none",
  signaturePolicyVersion: null,
};
const identity = {
  identity: {
    organization: id,
    issuer: "https://auth.example.test",
    subject: "ops",
    email: "ops@xbfreight.com",
    emailVerified: true as const,
    audience: "osp",
    authorizedParty: "client",
    expiresAt: 1,
    notBefore: 1,
  },
  permissions: ["osp:operate"],
  authorizationSessionId: "verified-session",
  authorizationSessionIssuedAt: "2026-09-08T12:00:00.000Z",
};
function setup(failure?: string) {
  const calls: SavePackageMemberReviewCommand[] = [];
  const handler = createCaseApiHandler({
    verifyToken: () => Promise.resolve(identity),
    verifyApprovalToken: () => Promise.resolve(identity),
    clarificationStore: {
      listForReview: () => Promise.resolve([]),
      saveOperationsReview: () => {
        throw new Error("UNEXPECTED");
      },
    },
    memberReviews: {
      save: (command) => {
        calls.push(command);
        if (failure) return Promise.reject(new Error(failure));
        return Promise.resolve({
          reviewId: id,
          reviewVersion: 1,
          replayed: false,
        });
      },
    },
  });
  const request = (
    body: unknown,
    query = "action=save_package_member_review",
    headers: Record<string, string> = {},
  ) =>
    handler(
      new Request(`https://example.test/functions/v1/osp-case-api?${query}`, {
        method: "POST",
        headers: {
          origin: "https://osp.heymarksman.com",
          authorization: "Bearer token",
          "x-osp-approval-proof": "header.payload.signature",
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  return { calls, request, handler };
}
Deno.test("member inspection endpoint binds authority only from verified proof", async () => {
  const { calls, request } = setup();
  assertEquals((await request(input)).status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].actor.subject, "ops");
  assertEquals(calls[0].actor.authorizationSessionId, "verified-session");
  assertEquals(calls[0].organizationId, id);
});
Deno.test("member inspection endpoint rejects injected authority, unknown fields, query pollution and oversized bodies", async () => {
  const { calls, request } = setup();
  for (
    const body of [
      { ...input, actor: identity },
      { ...input, organizationId: id },
      { ...input, extra: "x" },
      { ...input, outputSha256: "x".repeat(9000) },
      [],
    ]
  ) assertEquals((await request(body)).status, 400);
  assertEquals(
    (await request(
      input,
      "action=save_package_member_review&action=save_package_member_review",
    )).status,
    400,
  );
  assertEquals(
    (await request(input, undefined, { "x-osp-approval-proof": "" })).status,
    401,
  );
  assertEquals(calls.length, 0);
});
Deno.test("member inspection endpoint reports stale or conflicting evidence without retrying", async () => {
  for (const failure of ["PACKAGE_SET_REVIEW_STALE", "IDEMPOTENCY_CONFLICT"]) {
    const { calls, request } = setup(failure);
    const response = await request(input);
    assertEquals(response.status, 409);
    assertEquals((await response.json()).error.code, "VERSION_CONFLICT");
    assertEquals(calls.length, 1);
  }
});
Deno.test("member inspection preflight requires approval proof and JSON", async () => {
  const { handler } = setup();
  const response = await handler(
    new Request(
      "https://example.test/functions/v1/osp-case-api?action=save_package_member_review",
      {
        method: "OPTIONS",
        headers: {
          origin: "https://osp.heymarksman.com",
          "access-control-request-method": "POST",
          "access-control-request-headers":
            "authorization, content-type, x-osp-approval-proof",
        },
      },
    ),
  );
  assertEquals(response.status, 204);
});

Deno.test("Operations routes exact set digest to the set store, not legacy approval", async () => {
  let legacyCalls = 0, setCalls = 0;
  const handler = createCaseApiHandler({
    verifyToken: () => Promise.resolve(identity),
    verifyApprovalToken: () => Promise.resolve(identity),
    clarificationStore: {
      listForReview: () => Promise.resolve([]),
      saveOperationsReview: () => {
        throw new Error("UNEXPECTED");
      },
    },
    approvalActions: {
      completeOperations: () => {
        legacyCalls++;
        throw new Error("LEGACY_FORBIDDEN");
      },
      approveSignature: () => {
        throw new Error("SIGNATURE_FORBIDDEN");
      },
    },
    packageSetReviews: {
      complete: (command) => {
        setCalls++;
        assertEquals(command.expectedReviewSha256, "e".repeat(64));
        assertEquals(command.actor.subject, "ops");
        return Promise.resolve({
          caseId: id,
          state: "signature_approval",
          caseVersion: 8,
          replayed: false,
        });
      },
    },
  });
  const url =
    `https://example.test/functions/v1/osp-case-api?action=complete_operations_review&case_id=${id}&expected_case_version=7&input_snapshot_sha256=${
      "a".repeat(64)
    }&idempotency_key=ops-test&review_sha256=${"e".repeat(64)}`;
  const response = await handler(
    new Request(url, {
      method: "POST",
      headers: {
        origin: "https://osp.heymarksman.com",
        authorization: "Bearer token",
        "x-osp-approval-proof": "header.payload.signature",
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(setCalls, 1);
  assertEquals(legacyCalls, 0);
});
