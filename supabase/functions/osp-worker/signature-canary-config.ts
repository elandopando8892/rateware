export type SignatureCanaryConfiguration = Readonly<{
  organizationId: string;
  caseId: string;
  jobId: string;
  approvalId: string;
  expectedCaseVersion: number;
  inputSnapshotSha256: string;
  inputPackageSha256: string;
  signaturePositionVersion: number;
}>;

export interface SignatureCanaryEnvironment {
  get(name: string): string | undefined;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return parsed;
}

export function resolveSignatureCanary(
  env: SignatureCanaryEnvironment,
): SignatureCanaryConfiguration | undefined {
  const enabled = env.get("OSP_SIGNATURE_CANARY_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");

  const organizationId = env.get("OSP_SIGNATURE_CANARY_ORGANIZATION_ID")
    ?.trim() ?? "";
  const caseId = env.get("OSP_SIGNATURE_CANARY_CASE_ID")?.trim() ?? "";
  const jobId = env.get("OSP_SIGNATURE_CANARY_JOB_ID")?.trim() ?? "";
  const approvalId = env.get("OSP_SIGNATURE_CANARY_APPROVAL_ID")?.trim() ?? "";
  const inputSnapshotSha256 = env.get(
    "OSP_SIGNATURE_CANARY_INPUT_SNAPSHOT_SHA256",
  )?.trim() ?? "";
  const inputPackageSha256 = env.get(
    "OSP_SIGNATURE_CANARY_INPUT_PACKAGE_SHA256",
  )?.trim() ?? "";
  if (
    !UUID.test(organizationId) || !UUID.test(caseId) || !UUID.test(jobId) ||
    !UUID.test(approvalId) || !SHA256.test(inputSnapshotSha256) ||
    !SHA256.test(inputPackageSha256)
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");

  return Object.freeze({
    organizationId,
    caseId,
    jobId,
    approvalId,
    expectedCaseVersion: positiveInteger(
      env.get("OSP_SIGNATURE_CANARY_EXPECTED_CASE_VERSION")?.trim() ?? "",
    ),
    inputSnapshotSha256,
    inputPackageSha256,
    signaturePositionVersion: positiveInteger(
      env.get("OSP_SIGNATURE_CANARY_POSITION_VERSION")?.trim() ?? "",
    ),
  });
}
