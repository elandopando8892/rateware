import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  fingerprintPublicKeyPem,
  type ReleaseAuthorityEnvelope,
  type ReleaseControlStore,
  type ReleaseEvidenceStore,
  verifyReleaseAuthority,
} from "./handler.ts";
import {
  createReleaseControlRuntime,
  type ReleaseAuthorityVerifier,
  type ReleaseControlEnvironment,
  type ReleaseControlStores,
} from "./composition.ts";

const PROJECT = "abcdefghijklmnopqrst";
const DATABASE_URL =
  `postgresql://osp_release_control_runtime:password@db.${PROJECT}.supabase.co/postgres?sslmode=require`;
const CONTROL_ORIGIN = `https://${PROJECT}.supabase.co`;
const WORKFLOW_REF =
  `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${
    "9".repeat(40)
  }`;

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

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const der = new Uint8Array(
    await crypto.subtle.exportKey("spki", pair.publicKey),
  );
  return {
    pair,
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${
      base64(der)
    }\n-----END PUBLIC KEY-----\n`,
  };
}

type Fixture = {
  authorityVerifier: ReleaseAuthorityVerifier;
  leafPublicKeyPem: string;
  rootPublicKeyPem: string;
  runnerPublicKeyPem: string;
  requestPublicKeyPem: string;
  values: Record<string, string | undefined>;
};

async function fixture(): Promise<Fixture> {
  const [root, leaf, runner, request] = await Promise.all([
    keyPair(),
    keyPair(),
    keyPair(),
    keyPair(),
  ]);
  const authority = {
    environment: "production" as const,
    keys: [{
      algorithm: "Ed25519" as const,
      keyId: "release-owner-2026",
      publicKeyPem: leaf.publicKeyPem,
      role: "release_owner" as const,
    }],
    schemaVersion: 1 as const,
  };
  const rootSignature = base64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        root.pair.privateKey,
        new TextEncoder().encode(canonicalJson(authority)),
      ),
    ),
  );
  const runnerFingerprint = await fingerprintPublicKeyPem(
    runner.publicKeyPem,
  );
  const expectedRootFingerprint = await fingerprintPublicKeyPem(
    root.publicKeyPem,
  );
  return {
    authorityVerifier: (envelope, rootPublicKeyPem) =>
      verifyReleaseAuthority(
        envelope,
        rootPublicKeyPem,
        expectedRootFingerprint,
      ),
    leafPublicKeyPem: leaf.publicKeyPem,
    rootPublicKeyPem: root.publicKeyPem,
    runnerPublicKeyPem: runner.publicKeyPem,
    requestPublicKeyPem: request.publicKeyPem,
    values: {
      OSP_RELEASE_AUTHORITY_ENVELOPE_JSON: JSON.stringify(
        {
          authority,
          rootSignature,
        } satisfies ReleaseAuthorityEnvelope,
      ),
      OSP_RELEASE_CANDIDATE_COMMIT: "a".repeat(40),
      OSP_RELEASE_CONTROL_ORIGIN: CONTROL_ORIGIN,
      OSP_RELEASE_DATABASE_URL: DATABASE_URL,
      OSP_RELEASE_OPERATOR_TOKEN: "operator-token-value-at-least-32-characters",
      OSP_RELEASE_PROJECT_REF: PROJECT,
      OSP_RELEASE_ROOT_PUBLIC_KEY_PEM: root.publicKeyPem,
      OSP_RELEASE_REQUEST_APPROVAL_TRUST_JSON: JSON.stringify({
        keyFingerprint: await fingerprintPublicKeyPem(request.publicKeyPem),
        keyId: "request-approval-key-2026",
        publicKeyPem: request.publicKeyPem,
        role: "security_reviewer",
      }),
      OSP_RELEASE_RUNNER_TRUST_JSON: JSON.stringify({
        algorithm: "Ed25519",
        keyId: "runner-key-2026",
        publicKeyFingerprint: runnerFingerprint,
        publicKeyPem: runner.publicKeyPem,
        workflowRef: WORKFLOW_REF,
      }),
    },
  };
}

function environment(
  values: Record<string, string | undefined>,
): ReleaseControlEnvironment {
  return { get: (name) => values[name] };
}

const inertStores: ReleaseControlStores = {
  store: {
    get: () => Promise.reject(new Error("STORE_ACCESSED")),
    set: () => Promise.reject(new Error("STORE_ACCESSED")),
  } satisfies ReleaseControlStore,
  evidenceStore: {
    consume: () => Promise.reject(new Error("STORE_ACCESSED")),
  } satisfies ReleaseEvidenceStore,
};

async function rejectBeforeStores(
  setup: Fixture,
  overrides: Record<string, string | undefined>,
) {
  let storeConstructions = 0;
  await assertRejects(
    () =>
      createReleaseControlRuntime({
        authorityVerifier: setup.authorityVerifier,
        createStores: () => {
          storeConstructions++;
          return inertStores;
        },
        env: environment({ ...setup.values, ...overrides }),
      }),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertEquals(storeConstructions, 0);
}

Deno.test("release-control composition accepts canonical LF and CRLF root PEM before constructing stores and handler", async () => {
  const setup = await fixture();
  for (
    const rootPublicKeyPem of [
      setup.rootPublicKeyPem,
      setup.rootPublicKeyPem.trimEnd(),
      setup.rootPublicKeyPem.replaceAll("\n", "\r\n"),
      setup.rootPublicKeyPem.trimEnd().replaceAll("\n", "\r\n"),
    ]
  ) {
    let storeConstructions = 0;
    let seenDatabaseUrl = "";
    const runtime = await createReleaseControlRuntime({
      authorityVerifier: setup.authorityVerifier,
      createStores: (databaseUrl) => {
        storeConstructions++;
        seenDatabaseUrl = databaseUrl;
        return inertStores;
      },
      env: environment({
        ...setup.values,
        OSP_RELEASE_ROOT_PUBLIC_KEY_PEM: rootPublicKeyPem,
      }),
    });
    assertEquals(typeof runtime, "function");
    assertEquals(storeConstructions, 1);
    assertEquals(seenDatabaseUrl, DATABASE_URL);
  }
});

Deno.test("release-control composition rejects escaped, malformed, controlled, mixed, or extra root PEM before stores", async () => {
  const setup = await fixture();
  const pem = setup.rootPublicKeyPem;
  const [header, body, footer] = pem.trimEnd().split("\n");
  const arbitrarilyWrappedPem = `${header}\n${body.slice(0, 8)}\n${
    body.slice(8)
  }\n${footer}\n`;
  for (
    const invalid of [
      pem.trimEnd().replaceAll("\n", "\\n"),
      pem.replaceAll("PUBLIC KEY", "ED25519 PUBLIC KEY"),
      `${pem}extra`,
      "arbitrary\nmultiline\nvalue",
      pem.replace("\n", "\u0000\n"),
      pem.replace("\n", "\t\n"),
      pem.replace("\n", "\r"),
      pem.replace("\n", "\r\n"),
      `${pem}\n`,
      arbitrarilyWrappedPem,
    ]
  ) {
    await rejectBeforeStores(setup, {
      OSP_RELEASE_ROOT_PUBLIC_KEY_PEM: invalid,
    });
  }
});

Deno.test("release-control composition rejects noncanonical base64 PEM bodies before stores", async () => {
  const setup = await fixture();
  const [header, body, footer] = setup.rootPublicKeyPem.trimEnd().split("\n");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (!body.endsWith("=")) throw new Error("EXPECTED_PADDED_SPKI_FIXTURE");
  const finalSymbolIndex = alphabet.indexOf(body.at(-2)!);
  if (finalSymbolIndex < 0 || (finalSymbolIndex & 3) !== 0) {
    throw new Error("EXPECTED_CANONICAL_SPKI_FIXTURE");
  }
  const nonzeroPaddingBits = `${body.slice(0, -2)}${
    alphabet[finalSymbolIndex | 1]
  }=`;

  for (
    const invalidBody of [
      nonzeroPaddingBits,
      body.slice(0, -1),
      `${body}=`,
    ]
  ) {
    await rejectBeforeStores(setup, {
      OSP_RELEASE_ROOT_PUBLIC_KEY_PEM: `${header}\n${invalidBody}\n${footer}\n`,
    });
  }
});

Deno.test("release-control composition keeps scalar controls and cross-principal runner reuse fail-closed", async () => {
  const setup = await fixture();
  for (
    const [name, value] of [
      [
        "OSP_RELEASE_OPERATOR_TOKEN",
        `${setup.values.OSP_RELEASE_OPERATOR_TOKEN}\n`,
      ],
      ["OSP_RELEASE_DATABASE_URL", `${DATABASE_URL}\r`],
      [
        "OSP_RELEASE_AUTHORITY_ENVELOPE_JSON",
        `${setup.values.OSP_RELEASE_AUTHORITY_ENVELOPE_JSON}\u0000`,
      ],
      [
        "OSP_RELEASE_RUNNER_TRUST_JSON",
        `${setup.values.OSP_RELEASE_RUNNER_TRUST_JSON}\t`,
      ],
      ["OSP_RELEASE_CANDIDATE_COMMIT", `${"a".repeat(40)}\u007f`],
    ] as const
  ) {
    await rejectBeforeStores(setup, { [name]: value });
  }

  for (
    const [keyId, publicKeyPem] of [
      ["runner-relabelled-root", setup.rootPublicKeyPem],
      ["runner-relabelled-leaf", setup.leafPublicKeyPem],
    ] as const
  ) {
    await rejectBeforeStores(setup, {
      OSP_RELEASE_RUNNER_TRUST_JSON: JSON.stringify({
        algorithm: "Ed25519",
        keyId,
        publicKeyFingerprint: await fingerprintPublicKeyPem(publicKeyPem),
        publicKeyPem,
        workflowRef: WORKFLOW_REF,
      }),
    });
  }
});

Deno.test("release-control composition requires a separately provisioned request approval identity and rejects every principal collision before stores", async () => {
  const setup = await fixture();
  await rejectBeforeStores(setup, {
    OSP_RELEASE_REQUEST_APPROVAL_TRUST_JSON: undefined,
  });
  for (const [name, publicKeyPem] of [
    ["root", setup.rootPublicKeyPem],
    ["runner", setup.runnerPublicKeyPem],
    ["transition leaf", setup.leafPublicKeyPem],
  ] as const) {
    await rejectBeforeStores(setup, {
      OSP_RELEASE_REQUEST_APPROVAL_TRUST_JSON: JSON.stringify({
        keyFingerprint: "f".repeat(64),
        keyId: `request-${name.replace(" ", "-")}-key`,
        publicKeyPem,
        role: "security_reviewer",
      }),
    });
  }
});
