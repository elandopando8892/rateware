function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function safeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    sha256(left),
    sha256(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

async function authorized(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]{32,4096})$/.exec(header);
  return match !== null && await safeEqual(match[1], expectedToken);
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

type XlsxDocumentExtractCanary = {
  organizationId: string;
  caseId: string;
  jobId: string;
  documentVersionId: string;
  sourceSha256: string;
};

type SupplierPackageCanary = {
  organizationId: string;
  caseId: string;
  snapshotId: string;
  snapshotSha256: string;
};

type SignatureApplicationCanary = {
  organizationId: string;
  caseId: string;
  jobId: string;
  approvalId: string;
  expectedCaseVersion: number;
  inputSnapshotSha256: string;
  inputPackageSha256: string;
  signaturePositionVersion: number;
};

type RequestManifestShadow = {
  organizationId: string;
  caseId: string;
  gmailMessageId: string;
  gmailSourceSha256: string;
  documentVersionId: string;
  documentSourceSha256: string;
};

type RequestManifestCanary = {
  organizationId: string;
  caseId: string;
};

type ManualRequestCanary = {
  organizationId: string;
  pdfSha256: string;
  docxSha256: string;
  pdfBytes: Uint8Array;
  docxBytes: Uint8Array;
};

function decodeBase64(value: unknown): Uint8Array | null {
  if (
    typeof value !== "string" || value.length < 4 ||
    value.length > 14 * 1024 * 1024 || value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) return null;
  try {
    return Uint8Array.fromBase64(value);
  } catch {
    return null;
  }
}

export function createOspWorkerHandler(deps: {
  expectedToken: string;
  manualCanaryToken?: string;
  enqueue(limit: number): Promise<number>;
  run(limit: number): Promise<number>;
  runXlsxDocumentExtractCanary?: (
    input: XlsxDocumentExtractCanary,
  ) => Promise<number>;
  runSupplierPackageCanary?: (
    input: SupplierPackageCanary,
  ) => Promise<number>;
  runSignatureApplicationCanary?: (
    input: SignatureApplicationCanary,
  ) => Promise<number>;
  runRequestManifestShadow?: (
    input: RequestManifestShadow,
  ) => Promise<unknown>;
  runRequestManifestCanary?: (
    input: RequestManifestCanary,
  ) => Promise<unknown>;
  runManualRequestCanary?: (
    input: ManualRequestCanary,
  ) => Promise<unknown>;
}): (request: Request) => Promise<Response> {
  if (deps.expectedToken.length < 32) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: "POST_REQUIRED" });
    const serviceAuthorized = await authorized(request, deps.expectedToken);
    const manualCanaryAuthorized = deps.manualCanaryToken
      ? await authorized(request, deps.manualCanaryToken)
      : false;
    if (!serviceAuthorized && !manualCanaryAuthorized) {
      return json(401, { error: "UNAUTHORIZED" });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json(400, { error: "INVALID_REQUEST" });
    }
    if (body.action === "run_manual_request_canary") {
      if (!manualCanaryAuthorized) return json(401, { error: "UNAUTHORIZED" });
      const manualKeys = [
        "action",
        "docxBase64",
        "docxSha256",
        "organizationId",
        "pdfBase64",
        "pdfSha256",
      ];
      const keys = Object.keys(body).sort();
      const pdfBytes = decodeBase64(body.pdfBase64);
      const docxBytes = decodeBase64(body.docxBase64);
      if (
        keys.length !== manualKeys.length ||
        keys.some((key, index) => key !== manualKeys[index]) ||
        typeof body.organizationId !== "string" ||
        typeof body.pdfSha256 !== "string" ||
        typeof body.docxSha256 !== "string" ||
        !UUID.test(body.organizationId) || !SHA256.test(body.pdfSha256) ||
        !SHA256.test(body.docxSha256) || !pdfBytes || !docxBytes
      ) return json(400, { error: "INVALID_REQUEST" });
      if (!deps.runManualRequestCanary) {
        return json(409, { error: "CANARY_DISABLED" });
      }
      try {
        return json(
          200,
          await deps.runManualRequestCanary({
            organizationId: body.organizationId,
            pdfSha256: body.pdfSha256,
            docxSha256: body.docxSha256,
            pdfBytes,
            docxBytes,
          }),
        );
      } catch {
        return json(409, { error: "CANARY_NOT_READY" });
      }
    }
    if (!serviceAuthorized) return json(401, { error: "UNAUTHORIZED" });
    const keys = Object.keys(body).sort();
    if (body.action === "drain_rateware_gmail") {
      if (keys.some((key) => !["action", "limit"].includes(key))) {
        return json(400, { error: "INVALID_REQUEST" });
      }
      const limit = body.limit === undefined ? 10 : Number(body.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
        return json(400, { error: "INVALID_LIMIT" });
      }
      try {
        const enqueued = await deps.enqueue(limit);
        let processed = 0;
        let batches = 0;
        while (batches < 3) {
          const current = await deps.run(limit);
          processed += current;
          batches += 1;
          if (current < limit) break;
        }
        return json(200, { enqueued, processed, batches });
      } catch {
        return json(503, { error: "WORKER_UNAVAILABLE" });
      }
    }

    const manifestKeys = [
      "action",
      "caseId",
      "documentSourceSha256",
      "documentVersionId",
      "gmailMessageId",
      "gmailSourceSha256",
      "organizationId",
    ];
    if (body.action === "run_request_manifest_shadow") {
      if (
        keys.length !== manifestKeys.length ||
        keys.some((key, index) => key !== manifestKeys[index]) ||
        typeof body.organizationId !== "string" ||
        typeof body.caseId !== "string" ||
        typeof body.gmailMessageId !== "string" ||
        typeof body.gmailSourceSha256 !== "string" ||
        typeof body.documentVersionId !== "string" ||
        typeof body.documentSourceSha256 !== "string" ||
        !UUID.test(body.organizationId) || !UUID.test(body.caseId) ||
        !UUID.test(body.gmailMessageId) ||
        !SHA256.test(body.gmailSourceSha256) ||
        !UUID.test(body.documentVersionId) ||
        !SHA256.test(body.documentSourceSha256)
      ) return json(400, { error: "INVALID_REQUEST" });
      if (!deps.runRequestManifestShadow) {
        return json(409, { error: "CANARY_DISABLED" });
      }
      try {
        const result = await deps.runRequestManifestShadow({
          organizationId: body.organizationId,
          caseId: body.caseId,
          gmailMessageId: body.gmailMessageId,
          gmailSourceSha256: body.gmailSourceSha256,
          documentVersionId: body.documentVersionId,
          documentSourceSha256: body.documentSourceSha256,
        });
        return json(200, result);
      } catch {
        return json(503, { error: "WORKER_UNAVAILABLE" });
      }
    }

    const manifestDraftKeys = ["action", "caseId", "organizationId"];
    if (body.action === "run_request_manifest_canary") {
      if (
        keys.length !== manifestDraftKeys.length ||
        keys.some((key, index) => key !== manifestDraftKeys[index]) ||
        typeof body.organizationId !== "string" ||
        typeof body.caseId !== "string" ||
        !UUID.test(body.organizationId) || !UUID.test(body.caseId)
      ) return json(400, { error: "INVALID_REQUEST" });
      if (!deps.runRequestManifestCanary) {
        return json(409, { error: "CANARY_DISABLED" });
      }
      try {
        const result = await deps.runRequestManifestCanary({
          organizationId: body.organizationId,
          caseId: body.caseId,
        });
        return json(200, result);
      } catch {
        return json(503, { error: "WORKER_UNAVAILABLE" });
      }
    }

    const supplierPackageKeys = [
      "action",
      "caseId",
      "organizationId",
      "snapshotId",
      "snapshotSha256",
    ];
    if (body.action === "run_supplier_package_canary") {
      if (
        keys.length !== supplierPackageKeys.length ||
        keys.some((key, index) => key !== supplierPackageKeys[index]) ||
        typeof body.organizationId !== "string" ||
        typeof body.caseId !== "string" ||
        typeof body.snapshotId !== "string" ||
        typeof body.snapshotSha256 !== "string" ||
        !UUID.test(body.organizationId) ||
        !UUID.test(body.caseId) ||
        !UUID.test(body.snapshotId) ||
        !SHA256.test(body.snapshotSha256)
      ) return json(400, { error: "INVALID_REQUEST" });
      if (!deps.runSupplierPackageCanary) {
        return json(409, { error: "CANARY_DISABLED" });
      }
      try {
        const processed = await deps.runSupplierPackageCanary({
          organizationId: body.organizationId,
          caseId: body.caseId,
          snapshotId: body.snapshotId,
          snapshotSha256: body.snapshotSha256,
        });
        return processed === 1
          ? json(200, { processed })
          : json(409, { error: "CANARY_NOT_READY" });
      } catch {
        return json(503, { error: "WORKER_UNAVAILABLE" });
      }
    }

    const signatureKeys = [
      "action",
      "approvalId",
      "caseId",
      "expectedCaseVersion",
      "inputPackageSha256",
      "inputSnapshotSha256",
      "jobId",
      "organizationId",
      "signaturePositionVersion",
    ];
    if (body.action === "run_signature_application_canary") {
      if (
        keys.length !== signatureKeys.length ||
        keys.some((key, index) => key !== signatureKeys[index]) ||
        typeof body.organizationId !== "string" ||
        typeof body.caseId !== "string" ||
        typeof body.jobId !== "string" ||
        typeof body.approvalId !== "string" ||
        typeof body.inputSnapshotSha256 !== "string" ||
        typeof body.inputPackageSha256 !== "string" ||
        !UUID.test(body.organizationId) || !UUID.test(body.caseId) ||
        !UUID.test(body.jobId) || !UUID.test(body.approvalId) ||
        !SHA256.test(body.inputSnapshotSha256) ||
        !SHA256.test(body.inputPackageSha256) ||
        !Number.isSafeInteger(body.expectedCaseVersion) ||
        Number(body.expectedCaseVersion) < 1 ||
        !Number.isSafeInteger(body.signaturePositionVersion) ||
        Number(body.signaturePositionVersion) < 1
      ) return json(400, { error: "INVALID_REQUEST" });
      if (!deps.runSignatureApplicationCanary) {
        return json(409, { error: "CANARY_DISABLED" });
      }
      try {
        const processed = await deps.runSignatureApplicationCanary({
          organizationId: body.organizationId,
          caseId: body.caseId,
          jobId: body.jobId,
          approvalId: body.approvalId,
          expectedCaseVersion: Number(body.expectedCaseVersion),
          inputSnapshotSha256: body.inputSnapshotSha256,
          inputPackageSha256: body.inputPackageSha256,
          signaturePositionVersion: Number(body.signaturePositionVersion),
        });
        return processed === 1
          ? json(200, { processed })
          : json(409, { error: "CANARY_NOT_READY" });
      } catch {
        return json(503, { error: "WORKER_UNAVAILABLE" });
      }
    }

    const canaryKeys = [
      "action",
      "caseId",
      "documentVersionId",
      "jobId",
      "organizationId",
      "sourceSha256",
    ];
    if (
      body.action !== "run_xlsx_document_extract_canary" ||
      keys.length !== canaryKeys.length ||
      keys.some((key, index) => key !== canaryKeys[index]) ||
      typeof body.organizationId !== "string" ||
      typeof body.caseId !== "string" ||
      typeof body.jobId !== "string" ||
      typeof body.documentVersionId !== "string" ||
      typeof body.sourceSha256 !== "string" ||
      !UUID.test(body.organizationId) ||
      !UUID.test(body.caseId) ||
      !UUID.test(body.jobId) ||
      !UUID.test(body.documentVersionId) ||
      !SHA256.test(body.sourceSha256)
    ) return json(400, { error: "INVALID_REQUEST" });
    const canaryInput = {
      organizationId: body.organizationId,
      caseId: body.caseId,
      jobId: body.jobId,
      documentVersionId: body.documentVersionId,
      sourceSha256: body.sourceSha256,
    };
    if (!deps.runXlsxDocumentExtractCanary) {
      return json(409, { error: "CANARY_DISABLED" });
    }
    try {
      const processed = await deps.runXlsxDocumentExtractCanary(canaryInput);
      return processed === 1
        ? json(200, { processed })
        : json(409, { error: "CANARY_NOT_READY" });
    } catch {
      return json(503, { error: "WORKER_UNAVAILABLE" });
    }
  };
}
