import {
  assertReleaseDatabaseUrl,
  createReleaseControlHandler,
  fingerprintPublicKeyPem,
  parseStrictJsonObject,
  type ReleaseAuthorityEnvelope,
  type ReleaseControlStore,
  type ReleaseEvidenceStore,
  type RequestApprovalTrust,
  type VerifiedReleaseAuthorityKey,
  verifyReleaseAuthority,
  verifyRunnerPrincipalSeparation,
} from "./handler.ts";
import type { RunnerTrust } from "./runner-attestation.ts";

export type ReleaseControlEnvironment = {
  get(name: string): string | undefined;
};

export type ReleaseControlStores = {
  store: ReleaseControlStore;
  evidenceStore: ReleaseEvidenceStore;
};

export type ReleaseAuthorityVerifier = (
  envelope: ReleaseAuthorityEnvelope,
  rootPublicKeyPem: string,
) => Promise<readonly VerifiedReleaseAuthorityKey[]>;

const FORBIDDEN_SCALAR_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const FORBIDDEN_PEM_CONTROLS =
  /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

function requiredScalar(
  env: ReleaseControlEnvironment,
  name: string,
): string {
  const value = env.get(name);
  if (
    typeof value !== "string" || value.trim() === "" ||
    FORBIDDEN_SCALAR_CONTROLS.test(value)
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return value.trim();
}

function requiredPem(
  env: ReleaseControlEnvironment,
  name: string,
): string {
  const value = env.get(name);
  if (
    typeof value !== "string" || value === "" ||
    FORBIDDEN_PEM_CONTROLS.test(value)
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const withoutCrlf = value.replaceAll("\r\n", "");
  if (
    withoutCrlf.includes("\r") ||
    (value.includes("\r\n") && withoutCrlf.includes("\n"))
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const normalized = value.endsWith("\r\n")
    ? value.slice(0, -2)
    : value.endsWith("\n")
    ? value.slice(0, -1)
    : value;
  if (
    normalized === "" || normalized.endsWith("\r") ||
    normalized.endsWith("\n")
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return normalized;
}

type RunnerTrustConfiguration = RunnerTrust & { publicKeyFingerprint: string };

export async function createReleaseControlRuntime(options: {
  env: ReleaseControlEnvironment;
  createStores(databaseUrl: string): ReleaseControlStores;
  authorityVerifier?: ReleaseAuthorityVerifier;
}): Promise<(request: Request) => Promise<Response>> {
  try {
    const projectRef = requiredScalar(options.env, "OSP_RELEASE_PROJECT_REF");
    const databaseUrl = assertReleaseDatabaseUrl(
      requiredScalar(options.env, "OSP_RELEASE_DATABASE_URL"),
      projectRef,
    );
    const operatorToken = requiredScalar(
      options.env,
      "OSP_RELEASE_OPERATOR_TOKEN",
    );
    const expectedCandidateCommit = requiredScalar(
      options.env,
      "OSP_RELEASE_CANDIDATE_COMMIT",
    );
    const controlOrigin = requiredScalar(
      options.env,
      "OSP_RELEASE_CONTROL_ORIGIN",
    );

    const authorityEnvelope = JSON.parse(
      requiredScalar(options.env, "OSP_RELEASE_AUTHORITY_ENVELOPE_JSON"),
    ) as ReleaseAuthorityEnvelope;
    const releaseRootPublicKeyPem = requiredPem(
      options.env,
      "OSP_RELEASE_ROOT_PUBLIC_KEY_PEM",
    );
    const authorityKeys = await (
      options.authorityVerifier ?? verifyReleaseAuthority
    )(
      authorityEnvelope,
      releaseRootPublicKeyPem,
    );

    const parsedRequestApproval = parseStrictJsonObject(
      requiredScalar(options.env, "OSP_RELEASE_REQUEST_APPROVAL_TRUST_JSON"),
    );
    if (
      Object.keys(parsedRequestApproval).sort().join("\0") !==
        ["keyFingerprint", "keyId", "publicKeyPem", "role"].join("\0") ||
      typeof parsedRequestApproval.keyFingerprint !== "string" ||
      typeof parsedRequestApproval.keyId !== "string" ||
      typeof parsedRequestApproval.publicKeyPem !== "string" ||
      (parsedRequestApproval.role !== "release_owner" &&
        parsedRequestApproval.role !== "security_reviewer")
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    const requestApprovalTrust = parsedRequestApproval as RequestApprovalTrust;

    const parsedRunner = parseStrictJsonObject(
      requiredScalar(options.env, "OSP_RELEASE_RUNNER_TRUST_JSON"),
    );
    if (
      Object.keys(parsedRunner).sort().join("\0") !==
        [
          "algorithm",
          "keyId",
          "publicKeyFingerprint",
          "publicKeyPem",
          "workflowRef",
        ].join("\0") ||
      parsedRunner.algorithm !== "Ed25519" ||
      typeof parsedRunner.keyId !== "string" ||
      typeof parsedRunner.publicKeyPem !== "string" ||
      typeof parsedRunner.publicKeyFingerprint !== "string" ||
      typeof parsedRunner.workflowRef !== "string"
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    const runnerTrust = await verifyRunnerPrincipalSeparation(
      {
        algorithm: parsedRunner.algorithm,
        keyId: parsedRunner.keyId,
        publicKeyPem: parsedRunner.publicKeyPem,
        workflowRef: parsedRunner.workflowRef,
      },
      releaseRootPublicKeyPem,
      authorityKeys,
      requestApprovalTrust,
    );
    if (
      !/^[0-9a-f]{64}$/.test(parsedRunner.publicKeyFingerprint) ||
      await fingerprintPublicKeyPem(runnerTrust.publicKeyPem) !==
        parsedRunner.publicKeyFingerprint
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    const runnerTrustConfiguration: RunnerTrustConfiguration = {
      ...runnerTrust,
      publicKeyFingerprint: parsedRunner.publicKeyFingerprint,
    };

    const { store, evidenceStore } = options.createStores(databaseUrl);
    return await createReleaseControlHandler({
      operatorToken,
      store,
      evidenceStore,
      runnerTrust: runnerTrustConfiguration,
      expectedCandidateCommit,
      authorityKeys,
      immutableRootFingerprint: await fingerprintPublicKeyPem(
        releaseRootPublicKeyPem,
      ),
      immutableRootPublicKeyPem: releaseRootPublicKeyPem,
      requestApprovalTrust,
      controlOrigin,
      projectRef,
    });
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}
