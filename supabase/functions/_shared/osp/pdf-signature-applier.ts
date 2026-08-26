import { PDFDocument } from "pdf-lib";

import type {
  SignatureApplyReceipt,
  SignatureApplyRequest,
  SignaturePort,
} from "./signature-port.ts";
import { sha256Hex } from "./source-hash.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_/-]{1,512}$/;

export interface SignatureObjectPort {
  read(
    input: { organizationId: string; objectId: string },
    signal: AbortSignal,
  ): Promise<Uint8Array>;
  writeExclusive(
    input: {
      organizationId: string;
      objectId: string;
      bytes: Uint8Array;
      contentType: "application/pdf";
    },
    signal: AbortSignal,
  ): Promise<void>;
}

export interface PrivateSignaturePolicyPort {
  resolve(
    input: {
      organizationId: string;
      caseId: string;
      approvalId: string;
      jobId: string;
      leaseToken: string;
      positionVersion: number;
    },
    signal: AbortSignal,
  ): Promise<{
    signatureBytes: Uint8Array;
    contentType: "image/png" | "image/jpeg";
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

function invalid(code: string): never {
  throw new Error(code);
}

export function createPdfSignatureApplier(deps: {
  objects: SignatureObjectPort;
  policies: PrivateSignaturePolicyPort;
  uuid?: () => string;
}): SignaturePort {
  const uuid = deps.uuid ?? crypto.randomUUID;
  return Object.freeze({
    async apply(
      request: SignatureApplyRequest,
      signal: AbortSignal,
    ): Promise<SignatureApplyReceipt> {
      if (signal.aborted) invalid("SIGNATURE_ABORTED");
      if (
        !request || !UUID.test(request.organizationId) ||
        !UUID.test(request.caseId) || !UUID.test(request.approvalId) ||
        !UUID.test(request.jobId) || !UUID.test(request.leaseToken) ||
        !OPAQUE.test(request.inputObjectId) ||
        !SHA.test(request.expectedInputSha256) ||
        !Number.isSafeInteger(request.signaturePositionVersion) ||
        request.signaturePositionVersion < 1 ||
        request.signaturePositionVersion > 2_147_483_647
      ) invalid("SIGNATURE_REQUEST_INVALID");
      const inputBytes = await deps.objects.read({
        organizationId: request.organizationId,
        objectId: request.inputObjectId,
      }, signal);
      if (
        !(inputBytes instanceof Uint8Array) || inputBytes.byteLength < 1 ||
        inputBytes.byteLength > 25 * 1024 * 1024
      ) invalid("SIGNATURE_INPUT_INVALID");
      const inputSha256 = await sha256Hex(inputBytes);
      if (inputSha256 !== request.expectedInputSha256) {
        invalid("SIGNATURE_INPUT_MISMATCH");
      }
      const policy = await deps.policies.resolve({
        organizationId: request.organizationId,
        caseId: request.caseId,
        approvalId: request.approvalId,
        jobId: request.jobId,
        leaseToken: request.leaseToken,
        positionVersion: request.signaturePositionVersion,
      }, signal);
      if (
        !policy || !(policy.signatureBytes instanceof Uint8Array) ||
        policy.signatureBytes.byteLength < 1 ||
        policy.signatureBytes.byteLength > 1024 * 1024 ||
        !["image/png", "image/jpeg"].includes(policy.contentType) ||
        !Number.isSafeInteger(policy.page) || policy.page < 1 ||
        [policy.x, policy.y].some((value) =>
          typeof value !== "number" || !Number.isFinite(value) || value < 0
        ) ||
        [policy.width, policy.height].some((value) =>
          typeof value !== "number" || !Number.isFinite(value) || value <= 0
        )
      ) invalid("SIGNATURE_POSITION_INVALID");
      let document: PDFDocument;
      try {
        document = await PDFDocument.load(inputBytes.slice(), {
          ignoreEncryption: false,
        });
      } catch {
        invalid("SIGNATURE_INPUT_INVALID");
      }
      const page = document.getPages()[policy.page - 1];
      if (
        !page || policy.x + policy.width > page.getWidth() ||
        policy.y + policy.height > page.getHeight()
      ) invalid("SIGNATURE_POSITION_INVALID");
      try {
        const image = policy.contentType === "image/png"
          ? await document.embedPng(policy.signatureBytes)
          : await document.embedJpg(policy.signatureBytes);
        page.drawImage(image, {
          x: policy.x,
          y: policy.y,
          width: policy.width,
          height: policy.height,
        });
      } catch {
        invalid("SIGNATURE_ASSET_INVALID");
      }
      const outputBytes = await document.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });
      if (
        outputBytes.byteLength < 1 || outputBytes.byteLength > 25 * 1024 * 1024
      ) invalid("SIGNATURE_OUTPUT_INVALID");
      const outputId = uuid();
      if (!UUID.test(outputId)) invalid("SIGNATURE_OUTPUT_INVALID");
      const outputObjectId = `signed:${request.organizationId}:${outputId}`;
      try {
        await deps.objects.writeExclusive({
          organizationId: request.organizationId,
          objectId: outputObjectId,
          bytes: outputBytes,
          contentType: "application/pdf",
        }, signal);
      } catch (error) {
        if (
          error instanceof Error && error.message === "OBJECT_ALREADY_EXISTS"
        ) throw error;
        throw new Error("SIGNATURE_WRITE_OUTCOME_UNKNOWN");
      }
      return Object.freeze({
        inputSha256,
        outputSha256: await sha256Hex(outputBytes),
        outputObjectId,
      });
    },
  });
}
