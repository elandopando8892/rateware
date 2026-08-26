import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.14";
import {
  type ApproverRole,
  assertReleaseDatabaseUrl,
  createReleaseControlHandler,
  fingerprintPublicKeyPem,
  RELEASE_KEY_ID_PATTERN,
  type VerifiedReleaseAuthorityKey,
  type ReleaseMode,
  verifyReleaseAuthority,
  verifyRunnerPrincipalSeparation,
} from "./handler.ts";

const TOKEN = "operator-token-value-at-least-32-characters";
const ORIGIN = "https://abcdefghijklmnopqrst.supabase.co";
const PROJECT = "abcdefghijklmnopqrst";
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
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const pem = (bytes: Uint8Array) =>
  `-----BEGIN PUBLIC KEY-----\n${
    b64(bytes).match(/.{1,64}/g)!.join("\n")
  }\n-----END PUBLIC KEY-----\n`;

Deno.test("release key IDs use one canonical 8..200 opaque grammar", () => {
  for (const accepted of ["a".repeat(8), "request.approval.key", "a".repeat(200)]) {
    assertEquals(RELEASE_KEY_ID_PATTERN.test(accepted), true, accepted);
  }
  for (const rejected of ["abcd", "a".repeat(7), "a".repeat(201)]) {
    assertEquals(RELEASE_KEY_ID_PATTERN.test(rejected), false, rejected);
  }
});

async function fixture(initialState: { mode: ReleaseMode; version: number; releaseId: string | null } = {
  mode: "disabled",
  version: 1,
  releaseId: null,
}) {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const publicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)),
  );
  const runnerPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const runnerPublicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", runnerPair.publicKey)),
  );
  const salesPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const salesPublicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", salesPair.publicKey)),
  );
  const requestPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const requestPublicKeyPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", requestPair.publicKey)));
  const rootPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const rootPublicKeyPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", rootPair.publicKey)));
  const authorityFingerprint = await fingerprintPublicKeyPem(publicKeyPem);
  const runnerFingerprint = await fingerprintPublicKeyPem(runnerPublicKeyPem);
  const salesFingerprint = await fingerprintPublicKeyPem(salesPublicKeyPem);
  let state = { ...initialState };
  const used = new Set<string>();
  const setCalls: unknown[] = [];
  const store = {
    get: async () => ({ ...state }),
    set: async (input: any) => {
      setCalls.push(input);
      if (used.has(input.approvalId)) {
        throw new Error("RELEASE_APPROVAL_REPLAY");
      }
      used.add(input.approvalId);
      state = {
        mode: input.mode,
        version: state.version + 1,
        releaseId: input.releaseId,
      };
      return { ...state, receiptId: `receipt-${state.version}` };
    },
  };
  const handler = await createReleaseControlHandler({
    operatorToken: TOKEN,
    store,
    evidenceStore: {
      consume: async () => {
        throw new Error("EVIDENCE_STORE_NOT_EXPECTED");
      },
    },
    runnerTrust: {
      algorithm: "Ed25519",
      keyId: "runner-production-2026",
      publicKeyFingerprint: runnerFingerprint,
      publicKeyPem: runnerPublicKeyPem,
      workflowRef:
        `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${
          "9".repeat(40)
        }`,
    },
    expectedCandidateCommit: "a".repeat(40),
    authorityKeys: [
      {
        algorithm: "Ed25519",
        keyId: "release-owner-2026",
        publicKeyFingerprint: authorityFingerprint,
        publicKeyPem,
        role: "release_owner",
      },
      {
        algorithm: "Ed25519",
        keyId: "sales-authorizer-2026",
        publicKeyFingerprint: salesFingerprint,
        publicKeyPem: salesPublicKeyPem,
        role: "sales_authorizer",
      },
    ],
    controlOrigin: ORIGIN,
    immutableRootFingerprint: await fingerprintPublicKeyPem(rootPublicKeyPem),
    immutableRootPublicKeyPem: rootPublicKeyPem,
    projectRef: PROJECT,
    requestApprovalTrust: {
      keyFingerprint: await fingerprintPublicKeyPem(requestPublicKeyPem),
      keyId: "request-approval-key-2026",
      publicKeyPem: requestPublicKeyPem,
      role: "security_reviewer",
    },
    clock: () => new Date("2026-08-25T00:00:00.000Z"),
  });
  async function envelope(
    mode: ReleaseMode,
    overrides: Record<string, unknown> = {},
  ) {
    const sales = mode === "internal_send" || mode === "bounded_cohort";
    const authorization = {
      approvalId: `approval-${mode}-0001`,
      approverRole:
        (sales ? "sales_authorizer" : "release_owner") as ApproverRole,
      approverSubject: sales ? "person:sales-owner" : "person:release-owner",
      candidateCommit: "a".repeat(40),
      cohortPolicySha256: mode === "bounded_cohort" ? "c".repeat(64) : null,
      controlOrigin: ORIGIN,
      expiresAt: "2026-08-25T00:10:00.000Z",
      issuedAt: "2026-08-24T23:50:00.000Z",
      keyId: sales ? "sales-authorizer-2026" : "release-owner-2026",
      manifestSha256: "a".repeat(64),
      maximumCohortSize: 5,
      nonce: `nonce-${mode}-0001`,
      operationId: ({
        shadow: "P8_ENABLE_SHADOW_INTAKE",
        internal_send: "P11_INTERNAL_TEST_SEND",
        bounded_cohort: "P12_BOUNDED_COHORT",
        disabled: "P13_ROLLBACK_DRILL",
      } as const)[mode],
      projectRef: PROJECT,
      releaseId: "osp-mvp-20260825-01",
      schemaVersion: 1,
      expectedVersion: state.version,
      evidenceReceiptIds: ["11111111-1111-4111-8111-111111111111"],
      mode,
      cohortSize: mode === "bounded_cohort" ? 3 : null,
      cohortMembers: mode === "bounded_cohort"
        ? [
          {
            organizationId: "11111111-1111-4111-8111-111111111111",
            caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
          {
            organizationId: "22222222-2222-4222-8222-222222222222",
            caseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
          {
            organizationId: "33333333-3333-4333-8333-333333333333",
            caseId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          },
        ]
        : [],
      ...overrides,
    };
    const signature = b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "Ed25519",
          (sales ? salesPair : pair).privateKey,
          new TextEncoder().encode(canonicalJson(authorization)),
        ),
      ),
    );
    return {
      authorization,
      signature,
      transition: {
        ...(mode === "bounded_cohort" ? { cohortSize: 3 } : {}),
        expectedVersion: state.version,
        mode,
      },
    };
  }
  return { envelope, handler, setCalls };
}

function request(body: unknown, origin = ORIGIN, token = TOKEN) {
  return new Request(
    `${origin}/functions/v1/osp-release-control?action=set_release_mode`,
    {
      method: "POST",
      headers: {
        authorization: `ReleaseOperator ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function evidenceFixture(storeError?: string) {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const publicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)),
  );
  const authority = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const authorityPublicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", authority.publicKey)),
  );
  const runnerFingerprint = await fingerprintPublicKeyPem(publicKeyPem);
  const authorityFingerprint = await fingerprintPublicKeyPem(authorityPublicKeyPem);
  const requestKey = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const requestPublicKeyPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", requestKey.publicKey)));
  const requestFingerprint = await fingerprintPublicKeyPem(requestPublicKeyPem);
  const rootKey = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const rootPublicKeyPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", rootKey.publicKey)));
  const attestation = {
    candidateCommit: "a".repeat(40),
    commandSha256: "c".repeat(64),
    environment: "production",
    expiresAt: "2026-08-25T00:10:00.000Z",
    issuedAt: "2026-08-24T23:55:00.000Z",
    manifestSha256: "b".repeat(64),
    nonce: "runner-nonce-20260825-0001",
    operationId: "P8_ENABLE_SHADOW_INTAKE",
    outputSha256: "d".repeat(64),
    releaseId: "osp-mvp-20260825-01",
    requestExpiresAt: "2026-08-25T00:10:00.000Z",
    requestIssuedAt: "2026-08-24T23:55:00.000Z",
    requestingApprovalId: "request-approval-20260825-0001",
    requestingApprovalKeyFingerprint: requestFingerprint,
    requestingApprovalKeyId: "request-approval-key-2026",
    requestingApprovalRole: "security_reviewer",
    runId: "1234567890",
    schemaVersion: 1,
    step: "shadow-preflight",
    validatorSha256: "e".repeat(64),
    workflowRef: `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${
      "9".repeat(40)
    }`,
  };
  const signature = b64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(canonicalJson(attestation)),
      ),
    ),
  );
  const calls: unknown[] = [];
  const handler = await createReleaseControlHandler({
    operatorToken: TOKEN,
    store: {
      get: async () => ({
        mode: "disabled" as ReleaseMode,
        version: 3,
        releaseId: null,
      }),
      set: async () => {
        throw new Error("SET_NOT_EXPECTED");
      },
    },
    evidenceStore: {
      consume: async (input: unknown) => {
        calls.push(input);
        if (storeError) throw new Error(storeError);
        return {
          receiptId: "11111111-1111-4111-8111-111111111111",
          releaseId: attestation.releaseId,
          step: attestation.step,
          operationId: attestation.operationId,
          controlVersion: 3,
        };
      },
    },
    runnerTrust: {
      algorithm: "Ed25519",
      keyId: "runner-production-2026",
      publicKeyFingerprint: runnerFingerprint,
      publicKeyPem,
      workflowRef: attestation.workflowRef,
    },
    expectedCandidateCommit: attestation.candidateCommit,
    authorityKeys: [{
      algorithm: "Ed25519",
      keyId: "release-owner-2026",
      publicKeyFingerprint: authorityFingerprint,
      publicKeyPem: authorityPublicKeyPem,
      role: "release_owner",
    }],
    controlOrigin: ORIGIN,
    immutableRootFingerprint: await fingerprintPublicKeyPem(rootPublicKeyPem),
    immutableRootPublicKeyPem: rootPublicKeyPem,
    projectRef: PROJECT,
    requestApprovalTrust: {
      keyFingerprint: attestation.requestingApprovalKeyFingerprint,
      keyId: attestation.requestingApprovalKeyId,
      publicKeyPem: requestPublicKeyPem,
      role: attestation.requestingApprovalRole,
    },
    clock: () => new Date("2026-08-25T00:00:00.000Z"),
  } as any);
  const body = { attestation, signature, expectedVersion: 3 };
  const send = (value: unknown = body, init: RequestInit = {}) =>
    handler(
      new Request(
        `${ORIGIN}/functions/v1/osp-release-control?action=consume_release_evidence`,
        {
          method: "POST",
          headers: {
            authorization: `ReleaseOperator ${TOKEN}`,
            "content-type": "application/json",
            ...(init.headers ?? {}),
          },
          body: typeof value === "string" ? value : JSON.stringify(value),
        },
      ),
    );
  const sign = async (value: unknown) =>
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "Ed25519",
          pair.privateKey,
          new TextEncoder().encode(canonicalJson(value)),
        ),
      ),
    );
  return { attestation, body, calls, handler, send, sign };
}

Deno.test("consumes a verified runner attestation without exposing attestation secrets", async () => {
  const { attestation, calls, send } = await evidenceFixture();
  const response = await send();
  assertEquals(response.status, 201);
  const responseText = await response.text();
  assertEquals(JSON.parse(responseText), {
    data: {
      receiptId: "11111111-1111-4111-8111-111111111111",
      releaseId: attestation.releaseId,
      step: attestation.step,
      operationId: attestation.operationId,
      controlVersion: 3,
    },
  });
  assertEquals(calls.length, 1);
  const attestationSha256 = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(attestation)),
      ),
    ),
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  assertEquals(calls[0], {
    releaseId: attestation.releaseId,
    step: attestation.step,
    operationId: attestation.operationId,
    candidateCommit: attestation.candidateCommit,
    manifestSha256: attestation.manifestSha256,
    validatorSha256: attestation.validatorSha256,
    commandSha256: attestation.commandSha256,
    outputSha256: attestation.outputSha256,
    nonce: attestation.nonce,
    workflowRef: attestation.workflowRef,
    runId: attestation.runId,
    requestIssuedAt: attestation.requestIssuedAt,
    requestExpiresAt: attestation.requestExpiresAt,
    requestingApprovalId: attestation.requestingApprovalId,
    requestingApprovalKeyFingerprint: attestation.requestingApprovalKeyFingerprint,
    requestingApprovalKeyId: attestation.requestingApprovalKeyId,
    requestingApprovalRole: attestation.requestingApprovalRole,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    attestationSha256,
    runnerKeyId: "runner-production-2026",
    expectedVersion: 3,
  });
  for (const forbidden of ["signature", "nonce", "Sha256", "publicKey"]) {
    assertEquals(responseText.includes(forbidden), false);
  }
});

Deno.test("rejects duplicate raw JSON keys before evidence verification or storage", async () => {
  const { calls, send } = await evidenceFixture();
  const response = await send(
    '{"expectedVersion":3,"expectedVersion":3,"attestation":{},"signature":"x"}',
  );
  assertEquals(response.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("rejects escaped nested duplicate JSON keys before a signed transition reaches storage", async () => {
  const { envelope, handler, setCalls } = await fixture();
  const signed = await envelope("shadow");
  const candidate = `"candidateCommit":"${"a".repeat(40)}"`;
  const raw = JSON.stringify(signed).replace(
    candidate,
    `${candidate},"candidate\\u0043ommit":"${"a".repeat(40)}"`,
  );
  const response = await handler(
    new Request(
      `${ORIGIN}/functions/v1/osp-release-control?action=set_release_mode`,
      {
        method: "POST",
        headers: {
          authorization: `ReleaseOperator ${TOKEN}`,
          "content-type": "application/json",
        },
        body: raw,
      },
    ),
  );
  assertEquals(response.status, 400);
  assertEquals(setCalls.length, 0);
});

Deno.test("bounds streamed bodies before full consumption with absent or false Content-Length", async () => {
  const streamedRequest = (
    body: ReadableStream<Uint8Array>,
    contentLength?: string,
  ) => {
    const headers = new Headers({
      authorization: `ReleaseOperator ${TOKEN}`,
      "content-type": "application/json",
    });
    if (contentLength !== undefined) {
      headers.set("content-length", contentLength);
    }
    return new Request(
      `${ORIGIN}/functions/v1/osp-release-control?action=consume_release_evidence`,
      { method: "POST", headers, body },
    );
  };

  {
    const { body, calls, handler } = await evidenceFixture();
    const bytes = new TextEncoder().encode(canonicalJson(body));
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 7, bytes.byteLength);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
    });
    const request = streamedRequest(stream);
    assertEquals(request.headers.has("content-length"), false);
    assertEquals((await handler(request)).status, 201);
    assertEquals(calls.length, 1);
  }

  {
    const { calls, handler } = await evidenceFixture();
    const totalChunks = 100;
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls > totalChunks) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(4_096).fill(0x61));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const originalParse = JSON.parse;
    let parseCalls = 0;
    JSON.parse = ((...args: Parameters<typeof JSON.parse>) => {
      parseCalls++;
      return originalParse(...args);
    }) as typeof JSON.parse;
    let response: Response;
    try {
      const outcome = await Promise.race([
        handler(streamedRequest(stream, "100")).then((result) => ({ result })),
        new Promise<{ timedOut: true }>((resolve) =>
          setTimeout(() => resolve({ timedOut: true }), 250)
        ),
      ]);
      if ("timedOut" in outcome) throw new Error("BODY_CANCELLATION_AWAITED");
      response = outcome.result;
    } finally {
      JSON.parse = originalParse;
    }
    assertEquals(response.status, 400);
    assertEquals(cancelled, true);
    assertEquals(pulls < totalChunks, true);
    assertEquals(parseCalls, 0);
    assertEquals(calls.length, 0);
  }

  {
    const { calls, handler } = await evidenceFixture();
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array([0x7b, 0x7d]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = await handler(streamedRequest(stream, "24577"));
    assertEquals(response.status, 400);
    assertEquals(cancelled, true);
    assertEquals(pulls <= 1, true);
    assertEquals(calls.length, 0);
  }

  {
    const { calls, handler } = await evidenceFixture();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3]));
        controller.enqueue(new Uint8Array([0x28]));
        controller.close();
      },
    });
    assertEquals((await handler(streamedRequest(stream))).status, 400);
    assertEquals(calls.length, 0);
  }
});

Deno.test("rejects unauthenticated, browser, malformed, stale, and wrong-candidate evidence before storage", async () => {
  {
    const { calls, send } = await evidenceFixture();
    assertEquals(
      (await send(undefined, {
        headers: { authorization: "ReleaseOperator wrong-token" },
      })).status,
      401,
    );
    assertEquals(calls.length, 0);
  }
  {
    const { calls, send } = await evidenceFixture();
    assertEquals(
      (await send(undefined, {
        headers: { origin: "https://osp.heymarksman.com" },
      })).status,
      403,
    );
    assertEquals(calls.length, 0);
  }
  {
    const { body, calls, send } = await evidenceFixture();
    assertEquals((await send({ ...body, unexpected: true })).status, 400);
    assertEquals(
      (await send(undefined, {
        headers: { "content-type": "application/json; charset=utf-8" },
      })).status,
      400,
    );
    assertEquals((await send("x".repeat(24_577))).status, 400);
    assertEquals(calls.length, 0);
  }
  {
    const { body, calls, send } = await evidenceFixture();
    assertEquals(
      (await send({ ...body, signature: b64(new Uint8Array(64)) })).status,
      403,
    );
    assertEquals(calls.length, 0);
  }
  {
    const { attestation, body, calls, send, sign } = await evidenceFixture();
    const altered = { ...attestation, candidateCommit: "f".repeat(40) };
    assertEquals(
      (await send({
        ...body,
        attestation: altered,
        signature: await sign(altered),
      })).status,
      403,
    );
    const stale = { ...attestation, expiresAt: "2026-08-24T23:59:00.000Z" };
    assertEquals(
      (await send({
        ...body,
        attestation: stale,
        signature: await sign(stale),
      })).status,
      403,
    );
    assertEquals(calls.length, 0);
  }
});

Deno.test("maps a consumed evidence replay to conflict without CORS", async () => {
  const { send } = await evidenceFixture("RELEASE_EVIDENCE_REPLAY");
  const response = await send();
  assertEquals(response.status, 409);
  assertEquals(response.headers.has("access-control-allow-origin"), false);
  assertEquals(await response.json(), {
    error: { code: "RELEASE_CONTROL_CONFLICT" },
  });
});

Deno.test("operator token alone cannot fabricate a release approval", async () => {
  const { handler } = await fixture();
  const fabricated = {
    authorization: { approvalId: "approval-fake-0001" },
    signature: b64(new Uint8Array(64)),
    transition: { expectedVersion: 1, mode: "shadow" },
  };
  assertEquals((await handler(request(fabricated))).status, 400);
});

Deno.test("verifies the detached signature and exact target before a transition", async () => {
  const { envelope, handler } = await fixture();
  const valid = await envelope("shadow");
  assertEquals((await handler(request(valid))).status, 200);
  const crossed = await handler(
    request(
      await envelope("internal_send"),
      "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
    ),
  );
  assertEquals(crossed.status, 403);
  const altered = await envelope("internal_send");
  altered.authorization.manifestSha256 = "b".repeat(64);
  assertEquals((await handler(request(altered))).status, 403);
});

Deno.test("binds each operation to its independent approver role", async () => {
  const { envelope, handler } = await fixture();
  const wrong = await envelope("shadow", {
    approverRole: "sales_authorizer",
    keyId: "sales-authorizer-2026",
  });
  assertEquals((await handler(request(wrong))).status, 403);
});

Deno.test("rejects operator changes to signed transition version or cohort size", async () => {
  const { envelope, handler } = await fixture();
  const version = await envelope("shadow");
  version.transition.expectedVersion = 2;
  assertEquals((await handler(request(version))).status, 403);
  const cohort = await envelope("bounded_cohort");
  cohort.transition.cohortSize = 2;
  assertEquals((await handler(request(cohort))).status, 403);
  const receipts = await envelope("shadow");
  receipts.authorization.evidenceReceiptIds = [
    "22222222-2222-4222-8222-222222222222",
  ];
  assertEquals((await handler(request(receipts))).status, 403);
});

Deno.test("rejects malformed or duplicate signed cohort members before storage", async () => {
  for (const cohortMembers of [
    [
      { organizationId: "11111111-1111-1111-1111-111111111111", caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { organizationId: "22222222-2222-4222-8222-222222222222", caseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { organizationId: "33333333-3333-4333-8333-333333333333", caseId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    ],
    [
      { organizationId: "11111111-1111-4111-8111-111111111111", caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { organizationId: "11111111-1111-4111-8111-111111111111", caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { organizationId: "33333333-3333-4333-8333-333333333333", caseId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    ],
  ]) {
    const { envelope, handler, setCalls } = await fixture({
      mode: "internal_send",
      version: 3,
      releaseId: "osp-mvp-20260825-01",
    });
    const response = await handler(request(await envelope("bounded_cohort", { cohortMembers })));
    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: { code: "RELEASE_APPROVAL_INVALID" } });
    assertEquals(setCalls.length, 0);
  }
});

Deno.test("binds the expected candidate and ordered nonempty unique receipt list before storage", async () => {
  {
    const { envelope, handler, setCalls } = await fixture();
    const wrongCandidate = await envelope("shadow", {
      candidateCommit: "f".repeat(40),
    });
    assertEquals((await handler(request(wrongCandidate))).status, 403);

    const missing = await envelope("shadow");
    delete (missing.authorization as Record<string, unknown>)
      .evidenceReceiptIds;
    assertEquals((await handler(request(missing))).status, 400);

    const empty = await envelope("shadow", { evidenceReceiptIds: [] });
    assertEquals((await handler(request(empty))).status, 403);

    const duplicate = await envelope("shadow", {
      evidenceReceiptIds: [
        "11111111-1111-4111-8111-111111111111",
        "11111111-1111-4111-8111-111111111111",
      ],
    });
    assertEquals((await handler(request(duplicate))).status, 403);

    const reordered = await envelope("shadow", {
      evidenceReceiptIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    reordered.authorization.evidenceReceiptIds.reverse();
    assertEquals((await handler(request(reordered))).status, 403);
    assertEquals(setCalls.length, 0);
  }

  {
    const { envelope, handler, setCalls } = await fixture();
    const ordered = [
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ];
    const valid = await envelope("shadow", { evidenceReceiptIds: ordered });
    assertEquals((await handler(request(valid))).status, 200);
    assertEquals(setCalls.length, 1);
    assertEquals(
      (setCalls[0] as { evidenceReceiptIds: string[] }).evidenceReceiptIds,
      ordered,
    );
  }
});

Deno.test("rejects stale signatures and public browser requests", async () => {
  const { envelope, handler } = await fixture();
  const stale = await envelope("shadow", {
    expiresAt: "2026-08-24T23:59:00.000Z",
  });
  assertEquals((await handler(request(stale))).status, 403);
  const browser = request(await envelope("shadow"));
  browser.headers.set("origin", "https://osp.heymarksman.com");
  assertEquals((await handler(browser)).status, 403);
});

Deno.test("rejects weak or target-mismatched runtime configuration", async () => {
  await assertRejects(
    () =>
      createReleaseControlHandler({
        operatorToken: "weak",
        store: {} as any,
        authorityKeys: [],
        controlOrigin: ORIGIN,
        projectRef: PROJECT,
      } as any),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});

Deno.test("server accepts only a root-signed authority with the independently pinned root fingerprint", async () => {
  const root = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const leaf = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const publicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", root.publicKey)),
  );
  const fingerprint = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        await crypto.subtle.exportKey("spki", root.publicKey),
      ),
    ),
  ].map((v) => v.toString(16).padStart(2, "0")).join("");
  const leafPublicKeyPem = pem(
    new Uint8Array(await crypto.subtle.exportKey("spki", leaf.publicKey)),
  );
  const authority = {
    environment: "production" as const,
    keys: [{
      algorithm: "Ed25519" as const,
      keyId: "release-owner-2026",
      publicKeyPem: leafPublicKeyPem,
      role: "release_owner" as const,
    }],
    schemaVersion: 1 as const,
  };
  const rootSignature = b64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        root.privateKey,
        new TextEncoder().encode(canonicalJson(authority)),
      ),
    ),
  );
  assertEquals(
    (await verifyReleaseAuthority(
      { authority, rootSignature },
      publicKeyPem,
      fingerprint,
    )).length,
    1,
  );
  await assertRejects(
    () =>
      verifyReleaseAuthority(
        { authority, rootSignature },
        publicKeyPem,
        "0".repeat(64),
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  const rootAsLeaf = {
    ...authority,
    keys: [{ ...authority.keys[0], publicKeyPem }],
  };
  const rootAsLeafSignature = b64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        root.privateKey,
        new TextEncoder().encode(canonicalJson(rootAsLeaf)),
      ),
    ),
  );
  await assertRejects(
    () =>
      verifyReleaseAuthority(
        { authority: rootAsLeaf, rootSignature: rootAsLeafSignature },
        publicKeyPem,
        fingerprint,
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  const duplicated = {
    ...authority,
    keys: [...authority.keys, {
      ...authority.keys[0],
      keyId: "security-reviewer-2026",
      role: "security_reviewer" as const,
    }],
  };
  const duplicatedSignature = b64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        root.privateKey,
        new TextEncoder().encode(canonicalJson(duplicated)),
      ),
    ),
  );
  await assertRejects(
    () =>
      verifyReleaseAuthority(
        { authority: duplicated, rootSignature: duplicatedSignature },
        publicKeyPem,
        fingerprint,
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});

Deno.test("release root and transition leaves share the uniform LF or CRLF PEM grammar", async () => {
  const root = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const leaf = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const rootPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", root.publicKey)));
  const leafPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", leaf.publicKey)));
  const rootFingerprint = await fingerprintPublicKeyPem(rootPem);
  const authorityFor = (publicKeyPem: string) => ({
    environment: "production" as const,
    keys: [{ algorithm: "Ed25519" as const, keyId: "release-owner-2026", publicKeyPem, role: "release_owner" as const }],
    schemaVersion: 1 as const,
  });
  const verify = async (rootPublicKeyPem: string, leafPublicKeyPem: string) => {
    const authority = authorityFor(leafPublicKeyPem);
    const rootSignature = b64(new Uint8Array(await crypto.subtle.sign(
      "Ed25519",
      root.privateKey,
      new TextEncoder().encode(canonicalJson(authority)),
    )));
    return verifyReleaseAuthority({ authority, rootSignature }, rootPublicKeyPem, rootFingerprint);
  };
  for (const convert of [
    (value: string) => value,
    (value: string) => value.trimEnd(),
    (value: string) => value.replaceAll("\n", "\r\n"),
    (value: string) => value.trimEnd().replaceAll("\n", "\r\n"),
  ]) assertEquals((await verify(convert(rootPem), convert(leafPem))).length, 1);
  const mixed = (value: string) => {
    const [header, body, footer] = value.trimEnd().split("\n");
    return `${header}\r\n${body}\n${footer}\r\n`;
  };
  await assertRejects(() => verify(mixed(rootPem), leafPem), Error, "INVALID_RUNTIME_CONFIGURATION");
  await assertRejects(() => verify(rootPem, mixed(leafPem)), Error, "INVALID_RUNTIME_CONFIGURATION");
});

Deno.test("startup rejects every shared SPKI principal before handler or store construction", async () => {
  const makePair = async () => {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ]) as CryptoKeyPair;
    return {
      pair,
      publicKeyPem: pem(
        new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)),
      ),
    };
  };
  const root = await makePair();
  const leaf = await makePair();
  const runner = await makePair();
  const requestApproval = await makePair();
  const authorityKeys: VerifiedReleaseAuthorityKey[] = [{
    algorithm: "Ed25519" as const,
    keyId: "release-owner-label",
    publicKeyFingerprint: await fingerprintPublicKeyPem(leaf.publicKeyPem),
    publicKeyPem: leaf.publicKeyPem,
    role: "release_owner" as const,
  }];
  const requestApprovalTrust = {
    keyFingerprint: await fingerprintPublicKeyPem(requestApproval.publicKeyPem),
    keyId: "request-approval-key-label",
    publicKeyPem: requestApproval.publicKeyPem,
    role: "security_reviewer" as const,
  };
  const trust = (publicKeyPem: string, keyId: string) => ({
    algorithm: "Ed25519" as const,
    keyId,
    publicKeyPem,
    workflowRef: `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${
      "9".repeat(40)
    }`,
  });
  const boot = async (
    runnerPublicKeyPem: string,
    keys = authorityKeys,
  ) => {
    await verifyRunnerPrincipalSeparation(
      trust(runnerPublicKeyPem, "runner-different-label"),
      root.publicKeyPem,
      keys,
      requestApprovalTrust,
    );
    throw new Error("HANDLER_OR_STORE_CONSTRUCTED");
  };

  await assertRejects(
    () => boot(root.publicKeyPem),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  await assertRejects(
    () => boot(leaf.publicKeyPem),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  await assertRejects(
    () =>
      boot(runner.publicKeyPem, [
        ...authorityKeys,
        {
          ...authorityKeys[0],
          keyId: "security-reviewer-different-label",
          role: "security_reviewer" as const,
        },
      ]),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertEquals(
    await verifyRunnerPrincipalSeparation(
      trust(runner.publicKeyPem, "runner-unique-label"),
      root.publicKeyPem,
      authorityKeys,
      requestApprovalTrust,
    ),
    {
      ...trust(runner.publicKeyPem, "runner-unique-label"),
      publicKeyFingerprint: await fingerprintPublicKeyPem(runner.publicKeyPem),
    },
  );
});

Deno.test("direct factory derives every principal fingerprint and rejects relabelled PEMs before stores", async () => {
  const makeKey = async () => {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const publicKeyPem = pem(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
    return { publicKeyPem, fingerprint: await fingerprintPublicKeyPem(publicKeyPem) };
  };
  const root = await makeKey(), runner = await makeKey(), leaf = await makeKey();
  let storeCalls = 0;
  const options = {
    operatorToken: TOKEN,
    store: { get: () => { storeCalls++; return Promise.reject(new Error("STORE_ACCESSED")); }, set: () => { storeCalls++; return Promise.reject(new Error("STORE_ACCESSED")); } },
    evidenceStore: { consume: () => { storeCalls++; return Promise.reject(new Error("STORE_ACCESSED")); } },
    runnerTrust: { algorithm: "Ed25519" as const, keyId: "runner-production-2026", publicKeyFingerprint: runner.fingerprint, publicKeyPem: runner.publicKeyPem, workflowRef: `xbfreight/osp/.github/workflows/osp-production-evidence.yml@${"9".repeat(40)}` },
    expectedCandidateCommit: "a".repeat(40),
    authorityKeys: [{ algorithm: "Ed25519" as const, keyId: "release-owner-2026", publicKeyFingerprint: leaf.fingerprint, publicKeyPem: leaf.publicKeyPem, role: "release_owner" as const }],
    immutableRootFingerprint: root.fingerprint,
    immutableRootPublicKeyPem: root.publicKeyPem,
    controlOrigin: ORIGIN,
    projectRef: PROJECT,
  };
  for (const publicKeyPem of [leaf.publicKeyPem, runner.publicKeyPem]) {
    await assertRejects(() => createReleaseControlHandler({ ...options, requestApprovalTrust: { keyFingerprint: "f".repeat(64), keyId: "request.approval.key", publicKeyPem, role: "security_reviewer" as const } }), Error, "INVALID_RUNTIME_CONFIGURATION");
  }
  const independentRequest = await makeKey();
  await assertRejects(() => createReleaseControlHandler({ ...options, immutableRootFingerprint: "0".repeat(64), requestApprovalTrust: { keyFingerprint: independentRequest.fingerprint, keyId: "request.approval.key", publicKeyPem: independentRequest.publicKeyPem, role: "security_reviewer" as const } }), Error, "INVALID_RUNTIME_CONFIGURATION");
  assertEquals(storeCalls, 0);
});

Deno.test("signed evidence must match all separately pinned request approval identity fields before storage", async () => {
  for (const [field, value] of [
    ["requestingApprovalKeyFingerprint", "e".repeat(64)],
    ["requestingApprovalKeyId", "request-approval-key-other"],
    ["requestingApprovalRole", "release_owner"],
  ] as const) {
    const { attestation, body, calls, send, sign } = await evidenceFixture();
    const changed = { ...attestation, [field]: value };
    const response = await send({
      ...body,
      attestation: changed,
      signature: await sign(changed),
    });
    assertEquals(response.status, 403, field);
    assertEquals(calls.length, 0, field);
  }
});

Deno.test("database binding rejects username-suffix and hostile-host confusion", () => {
  const separator = String.fromCharCode(64);
  assertEquals(
    assertReleaseDatabaseUrl(
      `postgres://osp_release_control_runtime:secret${separator}db.${PROJECT}.supabase.co:5432/postgres?sslmode=require`,
      PROJECT,
    ),
    `postgres://osp_release_control_runtime:secret${separator}db.${PROJECT}.supabase.co:5432/postgres?sslmode=require`,
  );
  assertEquals(
    assertReleaseDatabaseUrl(
      `postgres://osp_release_control_runtime.${PROJECT}:secret${separator}aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
      PROJECT,
    ),
    `postgres://osp_release_control_runtime.${PROJECT}:secret${separator}aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
  );
  for (const username of ["postgres", `postgres.${PROJECT}`, "service_role"]) {
    assertThrows(
      () => assertReleaseDatabaseUrl(
        `postgres://${username}:secret${separator}db.${PROJECT}.supabase.co:5432/postgres?sslmode=require`,
        PROJECT,
      ),
      Error,
      "INVALID_RUNTIME_CONFIGURATION",
    );
  }
  assertThrows(
    () => assertReleaseDatabaseUrl(
      `postgres://osp_release_control_runtime:secret${separator}db.${PROJECT}.supabase.co:5432/postgres`,
      PROJECT,
    ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      assertReleaseDatabaseUrl(
        `postgres://postgres.${PROJECT}:secret${separator}attacker.example:5432/postgres`,
        PROJECT,
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      assertReleaseDatabaseUrl(
        `postgres://postgres.${PROJECT}:secret${separator}aws-0-us-east-1.pooler.supabase.com.attacker.example:6543/postgres`,
        PROJECT,
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
