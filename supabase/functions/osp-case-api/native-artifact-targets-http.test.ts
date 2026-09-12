import { assertEquals } from "jsr:@std/assert@1.0.14";
import { createCaseApiHandler } from "./handler.ts";
import type { RecordNativeArtifactTargetsInput } from "./native-artifact-targets.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity = {
  identity: {
    organization: id(1),
    issuer: "https://auth.example.test",
    subject: "ops-user",
    email: "ops@xbfreight.com",
    emailVerified: true as const,
    audience: "osp",
    authorizedParty: "client",
    expiresAt: 1,
    notBefore: 1,
  },
  permissions: ["osp:operate"],
  authorizationSessionId: "session",
  authorizationSessionIssuedAt: "2026-09-12T12:00:00.000Z",
};
const body: RecordNativeArtifactTargetsInput = {
  caseId: id(2),
  mappingId: id(3),
  expectedMappingVersion: 2,
  expectedMappingSha256: "a".repeat(64),
  expectedSourceVersionId: id(4),
  expectedSourceSha256: "b".repeat(64),
  idempotencyKey: "native-targets-1",
  targets: [{
    kind: "acroform",
    canonicalFieldId: "company.name",
    fieldName: "legal_name",
  }],
};

function setup(failure?: string) {
  const calls: RecordNativeArtifactTargetsInput[] = [];
  const handler = createCaseApiHandler({
    verifyToken: () => Promise.resolve(identity),
    verifyApprovalToken: () => Promise.resolve(identity),
    clarificationStore: {
      listForReview: () => Promise.resolve([]),
      saveOperationsReview: () => {
        throw new Error("UNEXPECTED");
      },
    },
    nativeArtifactTargets: {
      load: () => Promise.resolve([]),
      record: (input) => {
        calls.push(input);
        if (failure) return Promise.reject(new Error(failure));
        return Promise.resolve({
          mappingId: id(5),
          mappingVersion: 3,
          mappingSha256: "c".repeat(64),
          mappingReviewDecisionId: id(6),
          caseState: "preparing",
          caseVersion: 9,
          replayed: false,
        });
      },
    },
  });
  const request = (value: unknown) =>
    handler(
      new Request(
        "https://example.test/functions/v1/osp-case-api?action=record_native_artifact_targets",
        {
          method: "POST",
          headers: {
            origin: "https://osp.heymarksman.com",
            authorization: "Bearer token",
            "x-osp-approval-proof": "header.payload.signature",
            "content-type": "application/json",
          },
          body: JSON.stringify(value),
        },
      ),
    );
  return { calls, request };
}

Deno.test("native target action uses verified Supabase identity and returns typed receipt", async () => {
  const { calls, request } = setup();
  const response = await request(body);
  assertEquals(response.status, 200);
  assertEquals(calls, [body]);
  assertEquals((await response.json()).data.caseState, "preparing");
});

Deno.test("native target action rejects appendix and maps stale identity to conflict", async () => {
  const invalid = setup();
  assertEquals(
    (await invalid.request({
      ...body,
      targets: [{ kind: "appendix", canonicalFieldId: "company.name" }],
    })).status,
    400,
  );
  assertEquals(invalid.calls.length, 0);
  const stale = setup("VERSION_CONFLICT");
  assertEquals((await stale.request(body)).status, 409);
});
