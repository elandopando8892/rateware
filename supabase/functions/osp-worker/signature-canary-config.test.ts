import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveSignatureCanary } from "./signature-canary-config.ts";

function environment(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] };
}

const exact = {
  OSP_SIGNATURE_CANARY_ENABLED: "true",
  OSP_SIGNATURE_CANARY_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
  OSP_SIGNATURE_CANARY_CASE_ID: "22222222-2222-4222-8222-222222222222",
  OSP_SIGNATURE_CANARY_JOB_ID: "33333333-3333-4333-8333-333333333333",
  OSP_SIGNATURE_CANARY_APPROVAL_ID: "44444444-4444-4444-8444-444444444444",
  OSP_SIGNATURE_CANARY_EXPECTED_CASE_VERSION: "10",
  OSP_SIGNATURE_CANARY_INPUT_SNAPSHOT_SHA256: "a".repeat(64),
  OSP_SIGNATURE_CANARY_INPUT_PACKAGE_SHA256: "b".repeat(64),
  OSP_SIGNATURE_CANARY_POSITION_VERSION: "1",
};

Deno.test("signature canary stays disabled without its dedicated switch", () => {
  assertEquals(
    resolveSignatureCanary(environment({
      OSP_SIGNATURE_CANARY_CASE_ID: exact.OSP_SIGNATURE_CANARY_CASE_ID,
    })),
    undefined,
  );
});

Deno.test("signature canary requires one exact pending command", () => {
  assertThrows(
    () =>
      resolveSignatureCanary(environment({
        OSP_SIGNATURE_CANARY_ENABLED: "true",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      resolveSignatureCanary(environment({
        ...exact,
        OSP_SIGNATURE_CANARY_EXPECTED_CASE_VERSION: "0",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertEquals(resolveSignatureCanary(environment(exact)), {
    organizationId: exact.OSP_SIGNATURE_CANARY_ORGANIZATION_ID,
    caseId: exact.OSP_SIGNATURE_CANARY_CASE_ID,
    jobId: exact.OSP_SIGNATURE_CANARY_JOB_ID,
    approvalId: exact.OSP_SIGNATURE_CANARY_APPROVAL_ID,
    expectedCaseVersion: 10,
    inputSnapshotSha256: exact.OSP_SIGNATURE_CANARY_INPUT_SNAPSHOT_SHA256,
    inputPackageSha256: exact.OSP_SIGNATURE_CANARY_INPUT_PACKAGE_SHA256,
    signaturePositionVersion: 1,
  });
});
