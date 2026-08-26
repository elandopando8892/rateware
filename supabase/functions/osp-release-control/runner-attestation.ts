import { decodeCanonicalBase64 } from "./canonical-base64.ts";
import { RELEASE_KEY_ID_PATTERN } from "./release-key-id.ts";

export type RunnerTrust = {
  algorithm: "Ed25519";
  keyId: string;
  publicKeyPem: string;
  workflowRef: string;
};

export type VerifiedRunnerAttestation = {
  releaseId: string;
  step: string;
  operationId: string;
  candidateCommit: string;
  manifestSha256: string;
  validatorSha256: string;
  commandSha256: string;
  outputSha256: string;
  nonce: string;
  workflowRef: string;
  runId: string;
  requestIssuedAt: string;
  requestExpiresAt: string;
  requestingApprovalId: string;
  requestingApprovalKeyFingerprint: string;
  requestingApprovalKeyId: string;
  requestingApprovalRole: string;
  issuedAt: string;
  expiresAt: string;
  attestationSha256: string;
  runnerKeyId: string;
};

const ATTESTATION_KEYS = [
  "candidateCommit",
  "commandSha256",
  "environment",
  "expiresAt",
  "issuedAt",
  "manifestSha256",
  "nonce",
  "operationId",
  "outputSha256",
  "releaseId",
  "requestExpiresAt",
  "requestIssuedAt",
  "requestingApprovalId",
  "requestingApprovalKeyFingerprint",
  "requestingApprovalKeyId",
  "requestingApprovalRole",
  "runId",
  "schemaVersion",
  "step",
  "validatorSha256",
  "workflowRef",
] as const;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RELEASE_ID = /^osp-mvp-[0-9]{8}-[0-9]{2}$/;
const OPAQUE = RELEASE_KEY_ID_PATTERN;
const STEP = /^[a-z0-9][a-z0-9-]{2,127}$/;
const OPERATION = /^P[0-9]+_[A-Z0-9_]{3,127}$/;
const WORKFLOW =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml@[0-9a-f]{40}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUESTING_APPROVAL_ROLES = new Set(["release_owner", "security_reviewer"]);

function reject(): never {
  throw new Error("RUNNER_ATTESTATION_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${
          canonicalJson((value as Record<string, unknown>)[key])
        }`
      ).join(",")
    }}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) reject();
  return serialized;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeBase64(value: string): Uint8Array {
  try {
    return decodeCanonicalBase64(value);
  } catch {
    reject();
  }
}

function pemBytes(pem: string): Uint8Array {
  const match =
    /^-----BEGIN PUBLIC KEY-----(\r?\n)([A-Za-z0-9+/]+={0,2})\1-----END PUBLIC KEY-----(?:\1)?$/
      .exec(pem);
  if (!match) reject();
  return decodeBase64(match[2]);
}

function instant(value: unknown): number {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) reject();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    reject();
  }
  return parsed;
}

function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) reject();
  return value;
}

function workflowRef(value: unknown): string {
  return text(value, WORKFLOW);
}

export async function validateRunnerTrustConfiguration(
  trust: RunnerTrust,
): Promise<RunnerTrust> {
  if (
    !trust || trust.algorithm !== "Ed25519" || !OPAQUE.test(trust.keyId) ||
    typeof trust.publicKeyPem !== "string" || !WORKFLOW.test(trust.workflowRef)
  ) reject();
  workflowRef(trust.workflowRef);
  try {
    await crypto.subtle.importKey(
      "spki",
      exactBuffer(pemBytes(trust.publicKeyPem)),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch {
    reject();
  }
  return Object.freeze({ ...trust });
}

export async function verifyRunnerAttestation(
  input: unknown,
  trust: RunnerTrust,
  now: Date,
): Promise<VerifiedRunnerAttestation> {
  const envelope = record(input);
  if (
    !exactKeys(envelope, ["attestation", "signature"]) ||
    typeof envelope.signature !== "string"
  ) {
    reject();
  }
  if (!Number.isFinite(now.getTime())) reject();
  trust = await validateRunnerTrustConfiguration(trust);
  const a = record(envelope.attestation);
  if (!exactKeys(a, ATTESTATION_KEYS)) reject();
  if (
    a.schemaVersion !== 1 || a.environment !== "production" ||
    !RELEASE_ID.test(text(a.releaseId, RELEASE_ID)) ||
    !STEP.test(text(a.step, STEP)) ||
    !OPERATION.test(text(a.operationId, OPERATION)) ||
    !COMMIT.test(text(a.candidateCommit, COMMIT)) ||
    !SHA256.test(text(a.manifestSha256, SHA256)) ||
    !SHA256.test(text(a.validatorSha256, SHA256)) ||
    !SHA256.test(text(a.commandSha256, SHA256)) ||
    !SHA256.test(text(a.outputSha256, SHA256)) ||
    !OPAQUE.test(text(a.nonce, OPAQUE)) ||
    a.workflowRef !== trust.workflowRef ||
    workflowRef(a.workflowRef) !== trust.workflowRef ||
    !/^[0-9]{1,20}$/.test(text(a.runId, /^[0-9]{1,20}$/))
  ) reject();
  const issued = instant(a.issuedAt),
    expires = instant(a.expiresAt),
    requestIssued = instant(a.requestIssuedAt),
    requestExpires = instant(a.requestExpiresAt),
    current = now.getTime();
  if (
    !OPAQUE.test(text(a.requestingApprovalId, OPAQUE)) ||
    !SHA256.test(text(a.requestingApprovalKeyFingerprint, SHA256)) ||
    !OPAQUE.test(text(a.requestingApprovalKeyId, OPAQUE)) ||
    typeof a.requestingApprovalRole !== "string" ||
    !REQUESTING_APPROVAL_ROLES.has(a.requestingApprovalRole) ||
    requestIssued > current || requestExpires <= current ||
    requestExpires <= requestIssued || requestExpires - requestIssued > 900_000 ||
    issued < requestIssued || issued > current || expires <= current ||
    expires > requestExpires || expires - issued > 900_000
  ) {
    reject();
  }
  const canonical = new TextEncoder().encode(canonicalJson(a));
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      exactBuffer(pemBytes(trust.publicKeyPem)),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const signature = decodeBase64(envelope.signature);
    const runnerDigest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", exactBuffer(pemBytes(trust.publicKeyPem))),
    );
    const runnerFingerprint = [...runnerDigest].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    if (
      a.requestingApprovalKeyFingerprint === runnerFingerprint ||
      signature.byteLength !== 64 ||
      !await crypto.subtle.verify(
        "Ed25519",
        key,
        exactBuffer(signature),
        canonical,
      )
    ) reject();
  } catch (error) {
    if (
      error instanceof Error && error.message === "RUNNER_ATTESTATION_INVALID"
    ) throw error;
    reject();
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", canonical),
  );
  const attestationSha256 = [...digest].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return Object.freeze({
    releaseId: a.releaseId as string,
    requestExpiresAt: a.requestExpiresAt as string,
    requestIssuedAt: a.requestIssuedAt as string,
    requestingApprovalId: a.requestingApprovalId as string,
    requestingApprovalKeyFingerprint:
      a.requestingApprovalKeyFingerprint as string,
    requestingApprovalKeyId: a.requestingApprovalKeyId as string,
    requestingApprovalRole: a.requestingApprovalRole as string,
    step: a.step as string,
    operationId: a.operationId as string,
    candidateCommit: a.candidateCommit as string,
    manifestSha256: a.manifestSha256 as string,
    validatorSha256: a.validatorSha256 as string,
    commandSha256: a.commandSha256 as string,
    outputSha256: a.outputSha256 as string,
    nonce: a.nonce as string,
    workflowRef: a.workflowRef as string,
    runId: a.runId as string,
    issuedAt: a.issuedAt as string,
    expiresAt: a.expiresAt as string,
    attestationSha256,
    runnerKeyId: trust.keyId,
  });
}
