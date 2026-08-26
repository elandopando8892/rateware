import { decodeCanonicalBase64 } from "./canonical-base64.ts";
import {
  type RunnerTrust,
  validateRunnerTrustConfiguration,
  type VerifiedRunnerAttestation,
  verifyRunnerAttestation,
} from "./runner-attestation.ts";
import { RELEASE_KEY_ID_PATTERN } from "./release-key-id.ts";
export { RELEASE_KEY_ID_PATTERN } from "./release-key-id.ts";

export type ReleaseMode =
  | "disabled"
  | "shadow"
  | "internal_send"
  | "bounded_cohort";
export type ApproverRole =
  | "release_owner"
  | "security_reviewer"
  | "signature_owner"
  | "sales_authorizer";
export type ReleaseControlState = {
  mode: ReleaseMode;
  version: number;
  releaseId: string | null;
};
export type SignedAuthorization = {
  schemaVersion: 1;
  approvalId: string;
  approverRole: ApproverRole;
  approverSubject: string;
  candidateCommit: string;
  cohortPolicySha256: string | null;
  controlOrigin: string;
  expiresAt: string;
  issuedAt: string;
  keyId: string;
  manifestSha256: string;
  maximumCohortSize: number;
  cohortSize: number | null;
  cohortMembers: Array<{ organizationId: string; caseId: string }>;
  expectedVersion: number;
  evidenceReceiptIds: string[];
  mode: ReleaseMode;
  nonce: string;
  operationId: string;
  projectRef: string;
  releaseId: string;
};
export type ReleaseControlTransition = SignedAuthorization & {
  approvalKeyFingerprint: string;
  cohortSize: number | null;
};
export type ReleaseControlStore = {
  get(): Promise<ReleaseControlState>;
  set(
    input: ReleaseControlTransition,
  ): Promise<ReleaseControlState & { receiptId: string }>;
};
export type ReleaseEvidenceReceipt = {
  receiptId: string;
  releaseId: string;
  step: string;
  operationId: string;
  controlVersion: number;
};
export type ReleaseEvidenceStore = {
  consume(
    input: VerifiedRunnerAttestation & { expectedVersion: number },
  ): Promise<ReleaseEvidenceReceipt>;
};
export type ReleaseAuthorityKey = {
  algorithm: "Ed25519";
  keyId: string;
  publicKeyPem: string;
  role: ApproverRole;
};
export type VerifiedReleaseAuthorityKey = ReleaseAuthorityKey & {
  publicKeyFingerprint: string;
};
export type RequestApprovalTrust = {
  keyFingerprint: string;
  keyId: string;
  publicKeyPem: string;
  role: "release_owner" | "security_reviewer";
};
export type VerifiedRunnerTrust = RunnerTrust & {
  publicKeyFingerprint: string;
};
export type ReleaseAuthorityEnvelope = {
  authority: {
    environment: "production";
    keys: ReleaseAuthorityKey[];
    schemaVersion: 1;
  };
  rootSignature: string;
};

const MODES = new Set<ReleaseMode>([
  "disabled",
  "shadow",
  "internal_send",
  "bounded_cohort",
]);
const MODE_POLICY: Readonly<
  Record<ReleaseMode, { operation: string; role: ApproverRole }>
> = {
  bounded_cohort: { operation: "P12_BOUNDED_COHORT", role: "sales_authorizer" },
  disabled: { operation: "P13_ROLLBACK_DRILL", role: "release_owner" },
  internal_send: {
    operation: "P11_INTERNAL_TEST_SEND",
    role: "sales_authorizer",
  },
  shadow: { operation: "P8_ENABLE_SHADOW_INTAKE", role: "release_owner" },
};
const RELEASE_ID = /^osp-mvp-[0-9]{8}-[0-9]{2}$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$/;
const SHA = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const APPROVER_ROLES = new Set<ApproverRole>([
  "release_owner",
  "security_reviewer",
  "signature_owner",
  "sales_authorizer",
]);
export const DEPLOYED_RELEASE_ROOT_FINGERPRINT =
  "60138decfa0f244f975eb95083f812cd7bea2ee614d603009009d22a7aeaa488";
export function assertReleaseDatabaseUrl(
  value: string,
  projectRef: string,
): string {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const direct = databaseUrl.hostname === `db.${projectRef}.supabase.co` &&
    databaseUrl.username === "osp_release_control_runtime" &&
    (databaseUrl.port === "" || databaseUrl.port === "5432");
  const pooler =
    /^aws-0-[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname) &&
    databaseUrl.username === `osp_release_control_runtime.${projectRef}` &&
    ["5432", "6543"].includes(databaseUrl.port);
  if (
    (databaseUrl.protocol !== "postgres:" &&
      databaseUrl.protocol !== "postgresql:") ||
    (!direct && !pooler) || databaseUrl.pathname !== "/postgres" ||
    databaseUrl.search !== "?sslmode=require" || databaseUrl.hash ||
    !databaseUrl.password
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return databaseUrl.toString();
}
const canonicalJson = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonicalJson).join(",")}]`
    : value && typeof value === "object"
    ? `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${
          canonicalJson((value as Record<string, unknown>)[key])
        }`
      ).join(",")
    }}`
    : JSON.stringify(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
const error = (code: string, status: number) =>
  json({ error: { code } }, status);
function decode64(value: string): Uint8Array {
  try {
    return decodeCanonicalBase64(value);
  } catch {
    throw new Error("RELEASE_APPROVAL_SIGNATURE");
  }
}
function pemBytes(pem: string): Uint8Array {
  const match =
    /^-----BEGIN PUBLIC KEY-----(\r?\n)([A-Za-z0-9+/]+={0,2})\1-----END PUBLIC KEY-----(?:\1)?$/
      .exec(pem);
  if (!match) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  try {
    return decodeCanonicalBase64(match[2]);
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}
function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
export async function fingerprintPublicKeyPem(pem: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    exactBuffer(pemBytes(pem)),
  );
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}
async function fingerprintEd25519PublicKeyPem(pem: string): Promise<string> {
  const bytes = exactBuffer(pemBytes(pem));
  await crypto.subtle.importKey(
    "spki",
    bytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}
export async function verifyRunnerPrincipalSeparation(
  runnerTrust: RunnerTrust,
  releaseRootPublicKeyPem: string,
  authorityKeys: readonly VerifiedReleaseAuthorityKey[],
  requestApprovalTrust: RequestApprovalTrust,
): Promise<VerifiedRunnerTrust> {
  try {
    const validatedRunner = await validateRunnerTrustConfiguration(runnerTrust);
    const [runnerFingerprint, rootFingerprint, requestFingerprint, ...authorityFingerprints] = await Promise.all([
      fingerprintEd25519PublicKeyPem(validatedRunner.publicKeyPem),
      fingerprintEd25519PublicKeyPem(releaseRootPublicKeyPem),
      fingerprintEd25519PublicKeyPem(requestApprovalTrust.publicKeyPem),
      ...authorityKeys.map((key) => fingerprintEd25519PublicKeyPem(key.publicKeyPem)),
    ]);
    const principals = [runnerFingerprint, rootFingerprint, requestFingerprint, ...authorityFingerprints];
    if (!SHA.test(requestApprovalTrust.keyFingerprint) ||
      requestApprovalTrust.keyFingerprint !== requestFingerprint ||
      !RELEASE_KEY_ID_PATTERN.test(requestApprovalTrust.keyId) ||
      !["release_owner", "security_reviewer"].includes(requestApprovalTrust.role) ||
      authorityKeys.some((key, index) => key.publicKeyFingerprint !== authorityFingerprints[index])) {
      throw new Error("INVALID_RUNTIME_CONFIGURATION");
    }
    if (new Set(principals).size !== principals.length) {
      throw new Error("INVALID_RUNTIME_CONFIGURATION");
    }
    return Object.freeze({ ...validatedRunner, publicKeyFingerprint: runnerFingerprint });
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}
export async function verifyReleaseAuthority(
  envelope: ReleaseAuthorityEnvelope,
  rootPublicKeyPem: string,
  expectedRootFingerprint = DEPLOYED_RELEASE_ROOT_FINGERPRINT,
): Promise<readonly VerifiedReleaseAuthorityKey[]> {
  const rootFingerprint = await fingerprintPublicKeyPem(rootPublicKeyPem);
  if (
    rootFingerprint !== expectedRootFingerprint ||
    !envelope ||
    !exactKeys(envelope as unknown as Record<string, unknown>, [
      "authority",
      "rootSignature",
    ])
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const authority = envelope.authority;
  if (
    !authority ||
    !exactKeys(authority as unknown as Record<string, unknown>, [
      "environment",
      "keys",
      "schemaVersion",
    ]) || authority.environment !== "production" ||
    authority.schemaVersion !== 1 || !Array.isArray(authority.keys) ||
    authority.keys.length < 1
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const ids = new Set<string>(), principals = new Set<string>(),
    principalsByKeyId = new Map<string, string>();
  for (const key of authority.keys) {
    if (
      !exactKeys(key as unknown as Record<string, unknown>, [
        "algorithm",
        "keyId",
        "publicKeyPem",
        "role",
      ]) || key.algorithm !== "Ed25519" || !RELEASE_KEY_ID_PATTERN.test(key.keyId) ||
      !APPROVER_ROLES.has(key.role) || ids.has(key.keyId)
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    ids.add(key.keyId);
    const principal = await fingerprintPublicKeyPem(key.publicKeyPem);
    if (principal === rootFingerprint || principals.has(principal)) {
      throw new Error("INVALID_RUNTIME_CONFIGURATION");
    }
    principals.add(principal);
    principalsByKeyId.set(key.keyId, principal);
  }
  const root = await crypto.subtle.importKey(
    "spki",
    exactBuffer(pemBytes(rootPublicKeyPem)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const signature = decode64(envelope.rootSignature);
  if (
    signature.byteLength !== 64 ||
    !await crypto.subtle.verify(
      "Ed25519",
      root,
      exactBuffer(signature),
      new TextEncoder().encode(canonicalJson(authority)),
    )
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze(authority.keys.map((key) => Object.freeze({
    ...key,
    publicKeyFingerprint: principalsByKeyId.get(key.keyId)!,
  })));
}
async function sameSecret(left: string, right: string): Promise<boolean> {
  const e = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", e.encode(left)),
    crypto.subtle.digest("SHA-256", e.encode(right)),
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let d = aa.length ^ bb.length;
  for (let i = 0; i < aa.length; i++) d |= aa[i] ^ (bb[i] ?? 0);
  return d === 0;
}
function transitionAllowed(from: ReleaseMode, to: ReleaseMode): boolean {
  if (to === "disabled") return from !== "disabled";
  return (from === "disabled" && to === "shadow") ||
    (from === "shadow" && to === "internal_send") ||
    (from === "internal_send" && to === "bounded_cohort");
}

function parseRawString(text: string, start: number): [string, number] {
  if (text[start] !== '"') throw new Error("RELEASE_REQUEST_INVALID");
  let value = "", index = start + 1;
  while (index < text.length) {
    const current = text[index++];
    if (current === '"') return [value, index];
    if (current === "\\") {
      const escaped = text[index++];
      if (escaped === "u") {
        const hex = text.slice(index, index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new Error("RELEASE_REQUEST_INVALID");
        }
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
      } else {
        const escapes: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (!(escaped in escapes)) throw new Error("RELEASE_REQUEST_INVALID");
        value += escapes[escaped];
      }
    } else {
      if (current < " ") throw new Error("RELEASE_REQUEST_INVALID");
      value += current;
    }
  }
  throw new Error("RELEASE_REQUEST_INVALID");
}

function rejectDuplicateJsonKeys(text: string): void {
  const whitespace = (index: number) => {
    while (/[\t\n\r ]/.test(text[index] ?? "")) index++;
    return index;
  };
  const primitive = (index: number) => {
    const literal =
      /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/
        .exec(text.slice(index));
    if (!literal) throw new Error("RELEASE_REQUEST_INVALID");
    return index + literal[0].length;
  };
  const value = (start: number): number => {
    let index = whitespace(start);
    if (text[index] === '"') return parseRawString(text, index)[1];
    if (text[index] === "[") {
      index = whitespace(index + 1);
      if (text[index] === "]") return index + 1;
      while (true) {
        index = whitespace(value(index));
        if (text[index] === "]") return index + 1;
        if (text[index++] !== ",") throw new Error("RELEASE_REQUEST_INVALID");
      }
    }
    if (text[index] === "{") {
      const keys = new Set<string>();
      index = whitespace(index + 1);
      if (text[index] === "}") return index + 1;
      while (true) {
        const [key, afterKey] = parseRawString(text, index);
        if (keys.has(key)) throw new Error("RELEASE_REQUEST_INVALID");
        keys.add(key);
        index = whitespace(afterKey);
        if (text[index++] !== ":") throw new Error("RELEASE_REQUEST_INVALID");
        index = whitespace(value(index));
        if (text[index] === "}") return index + 1;
        if (text[index++] !== ",") throw new Error("RELEASE_REQUEST_INVALID");
        index = whitespace(index);
      }
    }
    return primitive(index);
  };
  if (whitespace(value(whitespace(0))) !== text.length) {
    throw new Error("RELEASE_REQUEST_INVALID");
  }
}

export function parseStrictJsonObject(text: string): Record<string, unknown> {
  try {
    rejectDuplicateJsonKeys(text);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error("RELEASE_REQUEST_INVALID");
  }
}

function cancelBodyWithoutWaiting(
  target:
    | ReadableStream<Uint8Array>
    | ReadableStreamDefaultReader<Uint8Array>,
): void {
  try {
    void target.cancel("RELEASE_REQUEST_INVALID").catch(() => undefined);
  } catch {
    // The public result is determined solely by the request framing.
  }
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.toLowerCase() !== "application/json" ||
    request.headers.has("content-encoding") ||
    request.headers.has("transfer-encoding")
  ) throw new Error("RELEASE_REQUEST_INVALID");
  const body = request.body;
  if (!body) throw new Error("RELEASE_REQUEST_INVALID");
  const declaredText = request.headers.get("content-length");
  let declaredLength: number | null = null;
  if (declaredText !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(declaredText)) {
      cancelBodyWithoutWaiting(body);
      throw new Error("RELEASE_REQUEST_INVALID");
    }
    declaredLength = Number(declaredText);
    if (
      !Number.isSafeInteger(declaredLength) || declaredLength < 2 ||
      declaredLength > 24_576
    ) {
      cancelBodyWithoutWaiting(body);
      throw new Error("RELEASE_REQUEST_INVALID");
    }
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let cancellationRequested = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (byteLength + value.byteLength > 24_576) {
        cancellationRequested = true;
        cancelBodyWithoutWaiting(reader);
        throw new Error("RELEASE_REQUEST_INVALID");
      }
      byteLength += value.byteLength;
      if (value.byteLength > 0) chunks.push(value);
    }
  } catch {
    if (!cancellationRequested) cancelBodyWithoutWaiting(reader);
    throw new Error("RELEASE_REQUEST_INVALID");
  } finally {
    reader.releaseLock();
  }
  if (
    byteLength < 2 ||
    (declaredLength !== null && declaredLength !== byteLength)
  ) {
    throw new Error("RELEASE_REQUEST_INVALID");
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseStrictJsonObject(text);
  } catch {
    throw new Error("RELEASE_REQUEST_INVALID");
  }
}

async function verifyEnvelope(
  row: Record<string, unknown>,
  keys: readonly VerifiedReleaseAuthorityKey[],
  origin: string,
  projectRef: string,
  now: Date,
): Promise<ReleaseControlTransition> {
  if (!exactKeys(row, ["authorization", "signature", "transition"])) {
    throw new Error("RELEASE_REQUEST_INVALID");
  }
  const a = row.authorization as Record<string, unknown>,
    t = row.transition as Record<string, unknown>;
  if (
    !a || !t || typeof row.signature !== "string" ||
    !exactKeys(a, [
      "approvalId",
      "approverRole",
      "approverSubject",
      "candidateCommit",
      "cohortPolicySha256",
      "cohortSize",
      "cohortMembers",
      "controlOrigin",
      "expiresAt",
      "expectedVersion",
      "evidenceReceiptIds",
      "issuedAt",
      "keyId",
      "manifestSha256",
      "maximumCohortSize",
      "mode",
      "nonce",
      "operationId",
      "projectRef",
      "releaseId",
      "schemaVersion",
    ])
  ) throw new Error("RELEASE_REQUEST_INVALID");
  const mode = t.mode as ReleaseMode,
    expectedKeys = mode === "bounded_cohort"
      ? ["cohortSize", "expectedVersion", "mode"]
      : ["expectedVersion", "mode"];
  if (
    !MODES.has(mode) || !exactKeys(t, expectedKeys) ||
    !Number.isSafeInteger(t.expectedVersion) || Number(t.expectedVersion) < 1
  ) throw new Error("RELEASE_REQUEST_INVALID");
  const auth = a as unknown as SignedAuthorization, policy = MODE_POLICY[mode];
  const cohortPairs = Array.isArray(auth.cohortMembers)
    ? auth.cohortMembers.map((member) =>
      `${member?.organizationId ?? ""}\0${member?.caseId ?? ""}`
    )
    : [];
  if (
    auth.schemaVersion !== 1 || !OPAQUE.test(auth.approvalId) ||
    !OPAQUE.test(auth.approverSubject) || !RELEASE_KEY_ID_PATTERN.test(auth.keyId) ||
    !OPAQUE.test(auth.nonce) || !COMMIT.test(auth.candidateCommit) ||
    !SHA.test(auth.manifestSha256) ||
    !RELEASE_ID.test(auth.releaseId) || auth.operationId !== policy.operation ||
    auth.approverRole !== policy.role || auth.projectRef !== projectRef ||
    auth.controlOrigin !== origin ||
    !Number.isSafeInteger(auth.maximumCohortSize) ||
    auth.maximumCohortSize < 1 || auth.maximumCohortSize > 50
  ) throw new Error("RELEASE_APPROVAL_INVALID");
  if (
    !Array.isArray(auth.evidenceReceiptIds) ||
    auth.evidenceReceiptIds.length < 1 ||
    auth.evidenceReceiptIds.some((receiptId) =>
      typeof receiptId !== "string" || !UUID.test(receiptId)
    ) ||
    new Set(auth.evidenceReceiptIds).size !== auth.evidenceReceiptIds.length
  ) throw new Error("RELEASE_APPROVAL_INVALID");
  if (
    auth.mode !== mode || auth.expectedVersion !== t.expectedVersion ||
    auth.cohortSize !== (mode === "bounded_cohort" ? t.cohortSize : null)
  ) throw new Error("RELEASE_APPROVAL_SIGNATURE");
  if (
    !Array.isArray(auth.cohortMembers) ||
    (mode === "bounded_cohort"
      ? auth.cohortMembers.length !== auth.cohortSize
      : auth.cohortMembers.length !== 0) ||
    auth.cohortMembers.some((member) =>
      !member ||
      !exactKeys(member as unknown as Record<string, unknown>, [
        "caseId",
        "organizationId",
      ]) || !UUID.test(member.caseId) || !UUID.test(member.organizationId)
    ) || new Set(cohortPairs).size !== cohortPairs.length
  ) throw new Error("RELEASE_APPROVAL_INVALID");
  if (
    (mode === "bounded_cohort" && !SHA.test(auth.cohortPolicySha256 ?? "")) ||
    (mode !== "bounded_cohort" && auth.cohortPolicySha256 !== null)
  ) throw new Error("RELEASE_APPROVAL_INVALID");
  const issued = Date.parse(auth.issuedAt),
    expires = Date.parse(auth.expiresAt),
    current = now.getTime();
  if (
    !Number.isFinite(issued) || !Number.isFinite(expires) || issued > current ||
    expires <= current || expires - issued > 3_600_000
  ) throw new Error("RELEASE_APPROVAL_STALE");
  const key = keys.find((candidate) =>
    candidate.keyId === auth.keyId && candidate.role === auth.approverRole &&
    candidate.algorithm === "Ed25519"
  );
  if (!key) throw new Error("RELEASE_APPROVAL_KEY");
  const imported = await crypto.subtle.importKey(
      "spki",
      exactBuffer(pemBytes(key.publicKeyPem)),
      { name: "Ed25519" },
      false,
      ["verify"],
    ),
    signature = decode64(row.signature);
  if (
    signature.byteLength !== 64 ||
    !await crypto.subtle.verify(
      "Ed25519",
      imported,
      exactBuffer(signature),
      new TextEncoder().encode(canonicalJson(a)),
    )
  ) throw new Error("RELEASE_APPROVAL_SIGNATURE");
  if (
    mode === "bounded_cohort" &&
    (!Number.isSafeInteger(t.cohortSize) || Number(t.cohortSize) < 1 ||
      Number(t.cohortSize) > auth.maximumCohortSize)
  ) throw new Error("RELEASE_REQUEST_INVALID");
  return { ...auth, approvalKeyFingerprint: key.publicKeyFingerprint };
}

export async function createReleaseControlHandler(
  options: {
    operatorToken: string;
    store: ReleaseControlStore;
    evidenceStore: ReleaseEvidenceStore;
    runnerTrust: VerifiedRunnerTrust;
    expectedCandidateCommit: string;
    authorityKeys: readonly VerifiedReleaseAuthorityKey[];
    immutableRootFingerprint: string;
    immutableRootPublicKeyPem: string;
    requestApprovalTrust: RequestApprovalTrust;
    controlOrigin: string;
    projectRef: string;
    clock?: () => Date;
  },
): Promise<(request: Request) => Promise<Response>> {
  let runnerTrust: VerifiedRunnerTrust;
  let authorityKeys: readonly VerifiedReleaseAuthorityKey[];
  let requestApprovalTrust: RequestApprovalTrust;
  try {
    const validatedRunner = await validateRunnerTrustConfiguration(options.runnerTrust);
    const [rootFingerprint, runnerFingerprint, requestFingerprint, ...authorityFingerprints] = await Promise.all([
      fingerprintEd25519PublicKeyPem(options.immutableRootPublicKeyPem),
      fingerprintEd25519PublicKeyPem(validatedRunner.publicKeyPem),
      fingerprintEd25519PublicKeyPem(options.requestApprovalTrust.publicKeyPem),
      ...options.authorityKeys.map((key) => fingerprintEd25519PublicKeyPem(key.publicKeyPem)),
    ]);
    if (
      rootFingerprint !== options.immutableRootFingerprint ||
      runnerFingerprint !== options.runnerTrust.publicKeyFingerprint ||
      requestFingerprint !== options.requestApprovalTrust.keyFingerprint ||
      options.authorityKeys.some((key, index) => key.publicKeyFingerprint !== authorityFingerprints[index])
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    const principals = [rootFingerprint, runnerFingerprint, requestFingerprint, ...authorityFingerprints];
    if (new Set(principals).size !== principals.length) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    runnerTrust = Object.freeze({ ...validatedRunner, publicKeyFingerprint: runnerFingerprint });
    requestApprovalTrust = Object.freeze({ ...options.requestApprovalTrust, keyFingerprint: requestFingerprint });
    authorityKeys = Object.freeze(options.authorityKeys.map((key, index) => Object.freeze({ ...key, publicKeyFingerprint: authorityFingerprints[index] })));
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  if (
    options.operatorToken.trim() !== options.operatorToken ||
    options.operatorToken.length < 32 || /[\r\n]/.test(options.operatorToken) ||
    !/^[a-z0-9]{20}$/.test(options.projectRef) ||
    options.controlOrigin !== `https://${options.projectRef}.supabase.co` ||
    options.authorityKeys.length < 1 ||
    !/^[0-9a-f]{40}$/.test(options.expectedCandidateCommit) ||
    !options.runnerTrust || options.runnerTrust.algorithm !== "Ed25519" ||
    !RELEASE_KEY_ID_PATTERN.test(runnerTrust.keyId) ||
    typeof runnerTrust.publicKeyPem !== "string" ||
    typeof runnerTrust.workflowRef !== "string" ||
    !SHA.test(runnerTrust.publicKeyFingerprint) ||
    !SHA.test(options.immutableRootFingerprint) ||
    !SHA.test(requestApprovalTrust?.keyFingerprint ?? "") ||
    !RELEASE_KEY_ID_PATTERN.test(requestApprovalTrust?.keyId ?? "") ||
    !["release_owner", "security_reviewer"].includes(requestApprovalTrust?.role) ||
    authorityKeys.some((key) => !SHA.test(key.publicKeyFingerprint) || !RELEASE_KEY_ID_PATTERN.test(key.keyId)) ||
    new Set([
      options.immutableRootFingerprint,
      runnerTrust.publicKeyFingerprint,
      requestApprovalTrust.keyFingerprint,
      ...authorityKeys.map((key) => key.publicKeyFingerprint),
    ]).size !== options.authorityKeys.length + 3
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return async (request) => {
    try {
      if (
        request.headers.has("origin") ||
        request.headers.has("access-control-request-method") ||
        request.headers.has("access-control-request-headers")
      ) return error("RELEASE_PUBLIC_REQUEST_DENIED", 403);
      if (request.method !== "POST") return error("METHOD_NOT_ALLOWED", 405);
      const url = new URL(request.url);
      if (
        url.origin !== options.controlOrigin ||
        url.pathname !== "/functions/v1/osp-release-control" || url.hash ||
        [...url.searchParams.keys()].join(",") !== "action"
      ) return error("RELEASE_TARGET_MISMATCH", 403);
      const match = /^ReleaseOperator ([^\s,]+)$/.exec(
        request.headers.get("authorization") ?? "",
      );
      if (!match || !await sameSecret(match[1], options.operatorToken)) {
        return error("RELEASE_OPERATOR_UNAUTHORIZED", 401);
      }
      const action = url.searchParams.get("action");
      if (action === "get_release_mode") {
        return json({ data: await options.store.get() }, 200);
      }
      if (action === "consume_release_evidence") {
        const row = await parseBody(request);
        if (
          !exactKeys(row, ["attestation", "expectedVersion", "signature"]) ||
          !Number.isSafeInteger(row.expectedVersion) ||
          Number(row.expectedVersion) < 1
        ) throw new Error("RELEASE_REQUEST_INVALID");
        const attestation = await verifyRunnerAttestation(
          { attestation: row.attestation, signature: row.signature },
          runnerTrust,
          (options.clock ?? (() => new Date()))(),
        );
        if (attestation.candidateCommit !== options.expectedCandidateCommit) {
          throw new Error("RUNNER_ATTESTATION_INVALID");
        }
        if (
          attestation.requestingApprovalKeyFingerprint !==
            requestApprovalTrust.keyFingerprint ||
          attestation.requestingApprovalKeyId !== requestApprovalTrust.keyId ||
          attestation.requestingApprovalRole !== requestApprovalTrust.role
        ) throw new Error("RUNNER_ATTESTATION_INVALID");
        const receipt = await options.evidenceStore.consume({
          ...attestation,
          expectedVersion: Number(row.expectedVersion),
        });
        return json({
          data: {
            receiptId: receipt.receiptId,
            releaseId: receipt.releaseId,
            step: receipt.step,
            operationId: receipt.operationId,
            controlVersion: receipt.controlVersion,
          },
        }, 201);
      }
      if (action !== "set_release_mode") {
        return error("RELEASE_REQUEST_INVALID", 400);
      }
      const row = await parseBody(request),
        auth = await verifyEnvelope(
          row,
          authorityKeys,
          options.controlOrigin,
          options.projectRef,
          (options.clock ?? (() => new Date()))(),
        ),
        transition = row.transition as {
          mode: ReleaseMode;
          expectedVersion: number;
          cohortSize?: number;
        };
      if (auth.candidateCommit !== options.expectedCandidateCommit) {
        throw new Error("RELEASE_APPROVAL_INVALID");
      }
      if (
        auth.approvalKeyFingerprint === requestApprovalTrust.keyFingerprint
      ) throw new Error("RELEASE_APPROVAL_INVALID");
      const input: ReleaseControlTransition = { ...auth, ...transition },
        current = await options.store.get();
      if (
        current.version !== input.expectedVersion ||
        !transitionAllowed(current.mode, input.mode) ||
        (!(current.mode === "disabled" && input.mode === "shadow") &&
          current.releaseId !== input.releaseId)
      ) return error("RELEASE_CONTROL_CONFLICT", 409);
      const result = await options.store.set(input);
      return json({
        data: {
          mode: result.mode,
          receiptId: result.receiptId,
          releaseId: result.releaseId,
          version: result.version,
        },
      }, 200);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (
        [
          "RELEASE_REQUEST_INVALID",
          "RELEASE_APPROVAL_INVALID",
          "RELEASE_APPROVAL_KEY",
          "RELEASE_APPROVAL_SIGNATURE",
          "RELEASE_APPROVAL_STALE",
          "RELEASE_EVIDENCE_INVALID",
          "RUNNER_ATTESTATION_INVALID",
        ].includes(code)
      ) return error(code, code === "RELEASE_REQUEST_INVALID" ? 400 : 403);
      if (
        [
          "RELEASE_CONTROL_STALE",
          "RELEASE_APPROVAL_REPLAY",
          "RELEASE_MODE_TRANSITION_DENIED",
          "RELEASE_ID_MISMATCH",
          "RELEASE_EVIDENCE_REPLAY",
          "RELEASE_CONTROL_VERSION_CONFLICT",
          "RELEASE_EVIDENCE_RECEIPTS_INVALID",
          "RELEASE_EVIDENCE_RECEIPTS_MISMATCH",
        ].includes(code)
      ) return error("RELEASE_CONTROL_CONFLICT", 409);
      return error("RELEASE_CONTROL_UNAVAILABLE", 503);
    }
  };
}
