import { assertEquals } from "jsr:@std/assert@1.0.14";
import {
  validateRunnerTrustConfiguration,
  verifyRunnerAttestation,
} from "./runner-attestation.ts";

const encoder = new TextEncoder();
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
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const publicPem = (bytes: Uint8Array) =>
  `-----BEGIN PUBLIC KEY-----\n${
    base64(bytes).match(/.{1,64}/g)!.join("\n")
  }\n-----END PUBLIC KEY-----\n`;
const attestation = () => ({
  schemaVersion: 1,
  environment: "production",
  releaseId: "osp-mvp-20260825-01",
  step: "supabase-migrations-before",
  operationId: "P3_SUPABASE_PREFLIGHT",
  candidateCommit: "a".repeat(40),
  manifestSha256: "b".repeat(64),
  validatorSha256: "c".repeat(64),
  commandSha256: "d".repeat(64),
  outputSha256: "e".repeat(64),
  nonce: "runner-nonce-20260825-0001",
  workflowRef: `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${
    "9".repeat(40)
  }`,
  runId: "1234567890",
  requestIssuedAt: "2026-08-25T14:59:00.000Z",
  requestExpiresAt: "2026-08-25T15:14:00.000Z",
  requestingApprovalId: "request-approval-20260825-0001",
  requestingApprovalKeyFingerprint: "f".repeat(64),
  requestingApprovalKeyId: "request-approval-key-2026",
  requestingApprovalRole: "security_reviewer",
  issuedAt: "2026-08-25T15:00:00.000Z",
  expiresAt: "2026-08-25T15:14:00.000Z",
});

async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const publicKeyPem = publicPem(publicKeyBytes);
  const runnerFingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", publicKeyBytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const other = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const otherPublicKeyPem = publicPem(
    new Uint8Array(await crypto.subtle.exportKey("spki", other.publicKey)),
  );
  const ecdsa = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const ecdsaPublicKeyPem = publicPem(
    new Uint8Array(await crypto.subtle.exportKey("spki", ecdsa.publicKey)),
  );
  const sign = async (value: unknown) =>
    base64(
      new Uint8Array(
        await crypto.subtle.sign(
          "Ed25519",
          pair.privateKey,
          encoder.encode(canonicalJson(value)),
        ),
      ),
    );
  const trust = {
    algorithm: "Ed25519" as const,
    keyId: "runner-production-2026",
    publicKeyPem,
    workflowRef: attestation().workflowRef,
  };
  return { ecdsaPublicKeyPem, otherPublicKeyPem, runnerFingerprint, sign, trust };
}

async function assertInvalid(
  action: () => Promise<unknown>,
  secrets: readonly string[] = [],
) {
  try {
    await action();
  } catch (error) {
    assertEquals(error instanceof Error, true);
    const message = (error as Error).message;
    assertEquals(message, "RUNNER_ATTESTATION_INVALID");
    for (const secret of secrets) assertEquals(message.includes(secret), false);
    return;
  }
  throw new Error("Expected RUNNER_ATTESTATION_INVALID");
}

Deno.test("runner trust uses the shared uniform LF or CRLF PEM grammar", async () => {
  const { trust } = await fixture();
  const lf = trust.publicKeyPem;
  for (const publicKeyPem of [
    lf,
    lf.trimEnd(),
    lf.replaceAll("\n", "\r\n"),
    lf.trimEnd().replaceAll("\n", "\r\n"),
  ]) {
    await validateRunnerTrustConfiguration({ ...trust, publicKeyPem });
  }
  const [header, body, footer] = lf.trimEnd().split("\n");
  for (const publicKeyPem of [
    `${lf}\n`,
    `${header}\r\n${body}\n${footer}\r\n`,
    `${header}\n${body.slice(0, 8)}\n${body.slice(8)}\n${footer}\n`,
  ]) {
    await assertInvalid(() =>
      validateRunnerTrustConfiguration({ ...trust, publicKeyPem })
    );
  }
});

Deno.test("verifies a canonical Ed25519 runner attestation and projects no key material", async () => {
  const { sign, trust } = await fixture();
  const signed = attestation();
  const verified = await verifyRunnerAttestation(
    { attestation: signed, signature: await sign(signed) },
    trust,
    new Date("2026-08-25T15:05:00.000Z"),
  );
  assertEquals(verified.nonce, signed.nonce);
  assertEquals(verified.runnerKeyId, "runner-production-2026");
  assertEquals(
    verified.attestationSha256,
    "37ecdab5954de46825028ee3218f64888b57f549beca8b57ef3c51aa9ee19744",
  );
  assertEquals(Object.keys(verified).sort(), [
    "attestationSha256",
    "candidateCommit",
    "commandSha256",
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
    "runnerKeyId",
    "step",
    "validatorSha256",
    "workflowRef",
  ]);
});

Deno.test("rejects adversarial runner attestations before returning a projection", async () => {
  const { ecdsaPublicKeyPem, otherPublicKeyPem, runnerFingerprint, sign, trust } = await fixture();
  const now = new Date("2026-08-25T15:05:00.000Z");
  const cases: Array<{
    name: string;
    alter?: (signed: Record<string, unknown>) => Record<string, unknown>;
    envelope?: (input: Record<string, unknown>) => Record<string, unknown>;
    trust?: Record<string, unknown>;
    resign?: boolean;
    secrets?: string[];
  }> = [
    {
      name: "signature-altered-field",
      alter: (signed) => ({ ...signed, nonce: "other-nonce" }),
    },
    {
      name: "unknown-envelope-key",
      envelope: (input) => ({ ...input, keyId: "unknown-runner-key" }),
    },
    {
      name: "extra-attestation-key",
      alter: (signed) => ({ ...signed, additional: null }),
      resign: true,
    },
    {
      name: "missing-attestation-key",
      alter: ({ outputSha256: _removed, ...signed }) => signed,
      resign: true,
    },
    {
      name: "wrong-workflow",
      alter: (signed) => ({
        ...signed,
        workflowRef: `xbfreight/osp/.github/workflows/other.yml@${
          "9".repeat(40)
        }`,
      }),
      resign: true,
    },
    {
      name: "wrong-environment",
      alter: (signed) => ({ ...signed, environment: "staging" }),
      resign: true,
    },
    {
      name: "wrong-candidate",
      alter: (signed) => ({ ...signed, candidateCommit: "f".repeat(40) }),
    },
    {
      name: "malformed-sha",
      alter: (signed) => ({ ...signed, outputSha256: "e".repeat(63) }),
      resign: true,
    },
    {
      name: "blank-nonce",
      alter: (signed) => ({ ...signed, nonce: "" }),
      resign: true,
    },
    {
      name: "future-issued",
      alter: (signed) => ({ ...signed, issuedAt: "2026-08-25T15:05:00.001Z" }),
      resign: true,
    },
    {
      name: "expired",
      alter: (signed) => ({ ...signed, expiresAt: "2026-08-25T15:05:00.000Z" }),
      resign: true,
    },
    {
      name: "over-fifteen-minutes",
      alter: (signed) => ({ ...signed, expiresAt: "2026-08-25T15:15:00.001Z" }),
      resign: true,
    },
    {
      name: "request-issued-in-future",
      alter: (signed) => ({ ...signed, requestIssuedAt: "2026-08-25T15:05:00.001Z" }),
      resign: true,
    },
    {
      name: "request-window-over-fifteen-minutes",
      alter: (signed) => ({ ...signed, requestIssuedAt: "2026-08-25T14:58:59.999Z" }),
      resign: true,
    },
    {
      name: "unknown-requesting-role",
      alter: (signed) => ({ ...signed, requestingApprovalRole: "sales_authorizer" }),
      resign: true,
    },
    {
      name: "invalid-requesting-approval-id",
      alter: (signed) => ({ ...signed, requestingApprovalId: "short" }),
      resign: true,
    },
    {
      name: "requesting-approval-key-shared-with-runner",
      alter: (signed) => ({ ...signed, requestingApprovalKeyFingerprint: runnerFingerprint }),
      resign: true,
    },
    {
      name: "invalid-requesting-approval-key-id",
      alter: (signed) => ({ ...signed, requestingApprovalKeyId: "short" }),
      resign: true,
    },
    {
      name: "invalid-base64",
      envelope: (input) => ({ ...input, signature: "%%%" }),
      secrets: ["%%%"],
    },
    {
      name: "wrong-ed25519-key",
      trust: { ...trust, publicKeyPem: otherPublicKeyPem },
      secrets: [otherPublicKeyPem],
    },
    {
      name: "non-ed25519-key",
      trust: { ...trust, publicKeyPem: ecdsaPublicKeyPem },
      secrets: [ecdsaPublicKeyPem],
    },
    {
      name: "malformed-pem",
      trust: {
        ...trust,
        publicKeyPem:
          "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n",
      },
      secrets: ["AAAA"],
    },
  ];
  for (const test of cases) {
    const signed = attestation();
    const changed = test.alter?.(signed) ?? signed;
    const input = test.envelope?.({
      attestation: changed,
      signature: await sign(test.resign ? changed : signed),
    }) ?? {
      attestation: changed,
      signature: await sign(test.resign ? changed : signed),
    };
    await assertInvalid(
      () =>
        verifyRunnerAttestation(
          input,
          (test.trust ?? trust) as typeof trust,
          now,
        ),
      [input.signature as string, ...(test.secrets ?? [])],
    );
  }
});

Deno.test("rejects mutable or noncanonical workflow identities", async () => {
  const { sign, trust } = await fixture();
  const now = new Date("2026-08-25T15:05:00.000Z");
  const refs = [
    "refs/heads/main",
    "refs/tags/v1",
    "v1",
    "9".repeat(39),
    "9".repeat(41),
    "A".repeat(40),
    `${"9".repeat(39)}g`,
  ];
  for (const ref of refs) {
    const workflowRef =
      `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${ref}`;
    const signed = { ...attestation(), workflowRef };
    const signature = await sign(signed);
    await assertInvalid(
      () =>
        verifyRunnerAttestation(
          { attestation: signed, signature },
          { ...trust, workflowRef },
          now,
        ),
      [workflowRef],
    );
  }
});

Deno.test("accepts only exact lowercase workflow commit identities", async () => {
  const { sign, trust } = await fixture();
  const now = new Date("2026-08-25T15:05:00.000Z");
  for (const [extension, workflowSha] of [["yml", "9"], ["yaml", "a"]]) {
    const workflowRef =
      `xbfreight/osp/.github/workflows/osp-production-evidence.${extension}@${
        workflowSha.repeat(40)
      }`;
    const signed = { ...attestation(), workflowRef };
    assertEquals(
      (await verifyRunnerAttestation(
        { attestation: signed, signature: await sign(signed) },
        { ...trust, workflowRef },
        now,
      )).workflowRef,
      workflowRef,
    );
  }
});

Deno.test("binds trust and signature to the exact workflow commit", async () => {
  const { sign, trust } = await fixture();
  const now = new Date("2026-08-25T15:05:00.000Z");
  const signed = attestation();
  const signature = await sign(signed);
  const changedWorkflowRef =
    `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${
      "8".repeat(40)
    }`;

  await assertInvalid(() =>
    verifyRunnerAttestation(
      { attestation: signed, signature },
      { ...trust, workflowRef: changedWorkflowRef },
      now,
    )
  );
  await assertInvalid(() =>
    verifyRunnerAttestation(
      {
        attestation: { ...signed, workflowRef: changedWorkflowRef },
        signature,
      },
      { ...trust, workflowRef: changedWorkflowRef },
      now,
    )
  );
});
