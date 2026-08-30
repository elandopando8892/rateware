import type {
  VerifiedApprovalIdentity,
  VerifiedWorkflowIdentity,
} from "../_shared/osp/workflow-authority.ts";
import {
  jsonResponse,
  NO_CACHE_HEADERS,
  OspApiError,
  postCorsHeaders,
  safeErrorResponse,
} from "../osp-read-api/http.ts";
import type {
  ClarificationQuestion,
  ClarificationReviewSummary,
} from "./postgres-store.ts";
import type { CaseApprovalActions } from "./actions.ts";
import type { CaseOutboundActions } from "./actions.ts";
import {
  assertOutboundDraft,
  type OutboundDraft,
} from "../_shared/osp/outbound-payload.ts";
import {
  approvalCommunicationsWorkspace,
  type WorkflowViewSource,
} from "./workflow-view.ts";

const ORIGINS = new Set([
  "http://localhost:8791",
  "https://osp.heymarksman.com",
]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;
const REVIEW_BODY_LIMIT = 65_536;
const OUTBOUND_DRAFT_BODY_LIMIT = 1_048_576;

type ClarificationStorePort = {
  listForReview(
    organizationId: string,
  ): Promise<readonly ClarificationReviewSummary[]>;
  saveOperationsReview(input: {
    organizationId: string;
    subject: string;
    draftId: string;
    expectedCaseVersion: number;
    expectedCanonicalSha256: string;
    questions: ClarificationReviewSummary["questions"];
  }): Promise<ClarificationReviewSummary>;
};

export type CaseApiHandlerOptions = {
  verifyToken(
    token: string,
    signal?: AbortSignal,
  ): Promise<VerifiedWorkflowIdentity>;
  verifyApprovalToken?(
    accessToken: string,
    idToken: string,
    signal?: AbortSignal,
  ): Promise<VerifiedApprovalIdentity>;
  clarificationStore: ClarificationStorePort;
  approvalActions?: CaseApprovalActions;
  outboundActions?: CaseOutboundActions;
  workflowView?: WorkflowViewSource;
  incidentId?: () => string;
};

function incident(factory: () => string): string {
  try {
    const value = factory();
    if (/^[A-Za-z0-9_-]{1,128}$/.test(value)) return value;
  } catch { /* use generated incident */ }
  return crypto.randomUUID();
}

function origin(request: Request): string {
  const value = request.headers.get("origin");
  if (!value || !ORIGINS.has(value)) throw new OspApiError("INVALID_REQUEST");
  return value;
}

function bearer(request: Request): string {
  const match = /^Bearer ([^\s,]+)$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) throw new OspApiError("UNAUTHORIZED");
  return match[1];
}

function approvalProof(request: Request): string {
  const value = request.headers.get("x-osp-approval-proof") ?? "";
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    throw new OspApiError("UNAUTHORIZED");
  }
  return value;
}

function authority(
  verified: VerifiedWorkflowIdentity,
  required: "read" | "operate",
) {
  const authorityPermissions = verified.permissions.filter((permission) =>
    permission === "osp:operate" ||
    permission === "osp:signature-approve" ||
    permission === "osp:sales-authorize" ||
    permission === "osp:send-authorized"
  );
  const allowed = required === "operate"
    ? authorityPermissions.length === 1 &&
      authorityPermissions[0] === "osp:operate"
    : verified.permissions.some((permission) =>
      permission === "osp:read" || permission === "osp:operate"
    );
  if (!allowed) throw new OspApiError("FORBIDDEN");
  return {
    organizationId: verified.identity.organization,
    subject: verified.identity.subject,
  };
}

function exactQuery(
  url: URL,
  names: readonly string[],
): Record<string, string> {
  const entries = [...url.searchParams.entries()];
  if (
    entries.length !== names.length ||
    new Set(entries.map(([name]) => name)).size !== entries.length
  ) throw new OspApiError("INVALID_REQUEST");
  if (
    entries.map(([name]) => name).sort().join("\u0000") !==
      [...names].sort().join("\u0000")
  ) throw new OspApiError("INVALID_REQUEST");
  return Object.fromEntries(entries);
}

function preflightHeaders(url: URL): readonly string[] {
  const action = url.searchParams.get("action");
  if (action === "list_clarification_reviews") {
    exactQuery(url, ["action"]);
    return ["authorization"];
  }
  if (action === "save_clarification_review") {
    exactQuery(url, [
      "action",
      "draft_id",
      "expected_case_version",
      "expected_canonical_sha256",
    ]);
    return ["authorization", "content-type"];
  }
  if (action === "get_approval_communications_workspace") {
    exactQuery(url, ["action", "case_id", "payload_id"]);
    return ["authorization"];
  }
  if (action === "complete_operations_review") {
    exactQuery(url, [
      "action",
      "case_id",
      "expected_case_version",
      "input_snapshot_sha256",
      "idempotency_key",
    ]);
    return ["authorization", "x-osp-approval-proof"];
  }
  if (action === "approve_and_apply_signature") {
    exactQuery(url, [
      "action",
      "case_id",
      "expected_case_version",
      "input_snapshot_sha256",
      "signature_position_version",
      "idempotency_key",
    ]);
    return ["authorization", "x-osp-approval-proof"];
  }
  if (action === "save_outbound_draft") {
    exactQuery(url, [
      "action",
      "case_id",
      "expected_case_version",
      "source_snapshot_sha256",
      "signed_package_sha256",
    ]);
    return ["authorization", "content-type"];
  }
  if (action === "freeze_outbound_payload") {
    exactQuery(url, [
      "action",
      "case_id",
      "payload_id",
      "expected_case_version",
      "idempotency_key",
    ]);
    return ["authorization"];
  }
  if (action === "authorize_outbound_payload") {
    exactQuery(url, [
      "action",
      "attachment_sha256s",
      "case_id",
      "expected_case_version",
      "idempotency_key",
      "payload_id",
      "payload_sha256",
    ]);
    return ["authorization", "x-osp-approval-proof"];
  }
  if (action === "request_authorized_send") {
    exactQuery(url, [
      "action",
      "case_id",
      "expected_case_version",
      "idempotency_key",
      "payload_sha256",
      "sales_authorization_id",
    ]);
    return ["authorization", "x-osp-approval-proof"];
  }
  throw new OspApiError("INVALID_REQUEST");
}

function exactPreflightHeaders(
  value: string | null,
  expected: readonly string[],
): boolean {
  if (value === null) return false;
  const names = value.split(",").map((name) => name.trim().toLowerCase());
  return names.length === expected.length &&
    new Set(names).size === names.length &&
    names.sort().join(",") === [...expected].sort().join(",");
}

async function requireEmptyBody(request: Request): Promise<void> {
  const declared = request.headers.get("content-length");
  if (
    request.headers.has("content-type") ||
    request.headers.has("content-encoding") ||
    request.headers.has("transfer-encoding") ||
    (declared !== null && declared !== "0")
  ) throw new OspApiError("INVALID_REQUEST");
  if (!request.body) return;
  const reader = request.body.getReader();
  const first = await reader.read();
  if (!first.done) {
    try {
      void reader.cancel().catch(() => undefined);
    } catch { /* request is already rejected */ }
    throw new OspApiError("INVALID_REQUEST");
  }
}

function safeQuestion(value: unknown): ClarificationQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OspApiError("INVALID_REQUEST");
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "evidenceIds,fieldId,kind,question" ||
    (row.kind !== "missing" && row.kind !== "contradiction") ||
    typeof row.fieldId !== "string" || !FIELD.test(row.fieldId) ||
    typeof row.question !== "string" || row.question.trim() !== row.question ||
    row.question.length < 3 || row.question.length > 500 ||
    /[<>]|(?:javascript|data):|https?:\/\//i.test(row.question) ||
    !Array.isArray(row.evidenceIds) || row.evidenceIds.length < 1 ||
    row.evidenceIds.length > 20 ||
    new Set(row.evidenceIds).size !== row.evidenceIds.length ||
    row.evidenceIds.some((id) => typeof id !== "string" || !OPAQUE.test(id))
  ) {
    throw new OspApiError("INVALID_REQUEST");
  }
  return Object.freeze({
    kind: row.kind,
    fieldId: row.fieldId,
    question: row.question,
    evidenceIds: Object.freeze([...row.evidenceIds] as string[]),
  });
}

async function reviewBody(
  request: Request,
): Promise<readonly ClarificationQuestion[]> {
  if (
    request.headers.get("content-type")?.toLowerCase() !== "application/json" ||
    request.headers.has("content-encoding") ||
    request.headers.has("transfer-encoding")
  ) throw new OspApiError("INVALID_REQUEST");
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/.test(declared) || Number(declared) < 1 ||
      Number(declared) > REVIEW_BODY_LIMIT)
  ) throw new OspApiError("INVALID_REQUEST");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (
    bytes.byteLength < 1 || bytes.byteLength > REVIEW_BODY_LIMIT ||
    (declared !== null && Number(declared) !== bytes.byteLength)
  ) throw new OspApiError("INVALID_REQUEST");
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new OspApiError("INVALID_REQUEST");
  }
  if (
    !decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
    Object.keys(decoded).join(",") !== "questions"
  ) throw new OspApiError("INVALID_REQUEST");
  const questions = (decoded as { questions?: unknown }).questions;
  if (
    !Array.isArray(questions) || questions.length < 1 || questions.length > 50
  ) throw new OspApiError("INVALID_REQUEST");
  const parsed = questions.map(safeQuestion);
  if (
    new Set(parsed.map((question) => question.fieldId)).size !== parsed.length
  ) throw new OspApiError("INVALID_REQUEST");
  return Object.freeze(parsed);
}

async function outboundDraftBody(
  request: Request,
  input: {
    organizationId: string;
    caseId: string;
    expectedCaseVersion: number;
    sourceSnapshotSha256: string;
    signedPackageSha256: string | null;
  },
): Promise<OutboundDraft> {
  if (
    request.headers.get("content-type")?.toLowerCase() !== "application/json" ||
    request.headers.has("content-encoding") ||
    request.headers.has("transfer-encoding")
  ) throw new OspApiError("INVALID_REQUEST");
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/.test(declared) || Number(declared) < 1 ||
      Number(declared) > OUTBOUND_DRAFT_BODY_LIMIT)
  ) throw new OspApiError("INVALID_REQUEST");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (
    bytes.byteLength < 1 || bytes.byteLength > OUTBOUND_DRAFT_BODY_LIMIT ||
    (declared !== null && Number(declared) !== bytes.byteLength)
  ) throw new OspApiError("INVALID_REQUEST");
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new OspApiError("INVALID_REQUEST");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new OspApiError("INVALID_REQUEST");
  }
  const row = decoded as Record<string, unknown>;
  const keys = [
    "attachments",
    "bodyText",
    "cc",
    "from",
    "inReplyTo",
    "kind",
    "payloadId",
    "references",
    "subject",
    "to",
  ];
  if (Object.keys(row).sort().join("\u0000") !== keys.join("\u0000")) {
    throw new OspApiError("INVALID_REQUEST");
  }
  try {
    return assertOutboundDraft({
      payloadId: row.payloadId,
      organizationId: input.organizationId,
      caseId: input.caseId,
      kind: row.kind,
      caseVersion: input.expectedCaseVersion,
      sourceSnapshotSha256: input.sourceSnapshotSha256,
      signedPackageSha256: input.signedPackageSha256,
      from: row.from,
      to: row.to,
      cc: row.cc,
      subject: row.subject,
      inReplyTo: row.inReplyTo,
      references: row.references,
      bodyText: row.bodyText,
      attachments: row.attachments,
    } as OutboundDraft);
  } catch {
    throw new OspApiError("INVALID_REQUEST");
  }
}

function attachmentHashes(value: string): readonly string[] {
  if (value === "none") return Object.freeze([]);
  const values = value.split(",");
  if (
    values.length < 1 || values.length > 20 ||
    values.some((hash) => !SHA.test(hash))
  ) throw new OspApiError("INVALID_REQUEST");
  return Object.freeze(values);
}

function serviceError(error: unknown): OspApiError {
  const code = error instanceof Error ? error.message : "";
  if (
    /^(CLARIFICATION_(?:NOT_FOUND|REVIEW_REJECTED|REVIEW_CONFLICT|REVIEW_SCOPE_MISMATCH|VERSION_CONFLICT))$/
      .test(code)
  ) return new OspApiError("INVALID_REQUEST");
  if (/^(CLARIFICATION_PERSISTENCE_FAILED|DATABASE_TEMPORARY)$/.test(code)) {
    return new OspApiError("DEPENDENCY_UNAVAILABLE");
  }
  if (/^(APPROVAL_FORBIDDEN)$/.test(code)) return new OspApiError("FORBIDDEN");
  if (/^(APPROVAL_PERSISTENCE_FAILED|SNAPSHOT_REBUILD_FAILED)$/.test(code)) {
    return new OspApiError("DEPENDENCY_UNAVAILABLE");
  }
  if (
    /^(OUTBOUND_(?:STORAGE_UNAVAILABLE|ATTACHMENT_UNAVAILABLE)|OUTBOUND_PERSISTENCE_FAILED)$/
      .test(code)
  ) return new OspApiError("DEPENDENCY_UNAVAILABLE");
  if (/^(OUTBOUND_|PAYLOAD_)/.test(code)) {
    return new OspApiError("INVALID_REQUEST");
  }
  if (/^(APPROVAL_|SIGNATURE_|SNAPSHOT_|VERSION_|IDEMPOTENCY_)/.test(code)) {
    return new OspApiError("INVALID_REQUEST");
  }
  return new OspApiError("INTERNAL_ERROR");
}

function errorResponse(
  error: unknown,
  incidentId: string,
  allowedOrigin?: string,
): Response {
  const response = safeErrorResponse(
    error,
    incidentId,
    allowedOrigin ? postCorsHeaders(allowedOrigin) : {},
  );
  if (response.status === 401) {
    response.headers.set("www-authenticate", 'Bearer realm="osp-case-api"');
  }
  return response;
}

function versionConflictResponse(
  incidentId: string,
  allowedOrigin?: string,
): Response {
  return jsonResponse(
    { error: { code: "VERSION_CONFLICT", incident_id: incidentId } },
    409,
    allowedOrigin ? postCorsHeaders(allowedOrigin) : {},
  );
}

export function createCaseApiHandler(
  options: CaseApiHandlerOptions,
): (request: Request) => Promise<Response> {
  const nextIncident = options.incidentId ?? crypto.randomUUID;
  return async (request) => {
    if (request.method === "OPTIONS") {
      try {
        const allowed = origin(request);
        const url = new URL(request.url);
        if (
          !url.pathname.endsWith("/osp-case-api") || url.hash ||
          request.headers.get("access-control-request-method") !== "POST"
        ) throw new OspApiError("INVALID_REQUEST");
        const headers = preflightHeaders(url);
        if (
          !exactPreflightHeaders(
            request.headers.get("access-control-request-headers"),
            headers,
          )
        ) throw new OspApiError("INVALID_REQUEST");
        return new Response(null, {
          status: 204,
          headers: {
            ...NO_CACHE_HEADERS,
            "access-control-allow-origin": allowed,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": headers.join(", "),
            "access-control-max-age": "600",
            vary:
              "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
          },
        });
      } catch (error) {
        return errorResponse(error, incident(nextIncident));
      }
    }
    const requestOrigin = request.headers.get("origin");
    const allowedOrigin = requestOrigin && ORIGINS.has(requestOrigin)
      ? requestOrigin
      : undefined;
    try {
      if (request.method !== "POST") {
        throw new OspApiError("METHOD_NOT_ALLOWED");
      }
      const allowed = origin(request);
      const url = new URL(request.url);
      if (!url.pathname.endsWith("/osp-case-api") || url.hash) {
        throw new OspApiError("INVALID_REQUEST");
      }
      const action = url.searchParams.get("action");
      if (action === "get_approval_communications_workspace") {
        if (!options.workflowView) throw new OspApiError("INVALID_REQUEST");
        const query = exactQuery(url, ["action", "case_id", "payload_id"]);
        await requireEmptyBody(request);
        if (
          !UUID.test(query.case_id) ||
          (query.payload_id !== "none" && !UUID.test(query.payload_id))
        ) throw new OspApiError("INVALID_REQUEST");
        const verified = await options.verifyToken(
          bearer(request),
          request.signal,
        );
        authority(verified, "read");
        const record = await options.workflowView.load({
          organizationId: verified.identity.organization,
          caseId: query.case_id,
          payloadId: query.payload_id === "none" ? null : query.payload_id,
        });
        return jsonResponse(
          { data: approvalCommunicationsWorkspace(record, verified) },
          200,
          postCorsHeaders(allowed),
        );
      }
      if (action === "list_clarification_reviews") {
        const verified = await options.verifyToken(
          bearer(request),
          request.signal,
        );
        exactQuery(url, ["action"]);
        await requireEmptyBody(request);
        const scope = authority(verified, "read");
        return jsonResponse(
          {
            data: {
              drafts: await options.clarificationStore.listForReview(
                scope.organizationId,
              ),
            },
          },
          200,
          postCorsHeaders(allowed),
        );
      }
      if (action === "save_clarification_review") {
        const verified = await options.verifyToken(
          bearer(request),
          request.signal,
        );
        const query = exactQuery(url, [
          "action",
          "draft_id",
          "expected_case_version",
          "expected_canonical_sha256",
        ]);
        const scope = authority(verified, "operate");
        const expectedCaseVersion = Number(query.expected_case_version);
        if (
          !UUID.test(query.draft_id) ||
          !Number.isSafeInteger(expectedCaseVersion) ||
          expectedCaseVersion < 0 || expectedCaseVersion > 2_147_483_647 ||
          !SHA.test(query.expected_canonical_sha256)
        ) throw new OspApiError("INVALID_REQUEST");
        const result = await options.clarificationStore.saveOperationsReview({
          ...scope,
          draftId: query.draft_id,
          expectedCaseVersion,
          expectedCanonicalSha256: query.expected_canonical_sha256,
          questions: await reviewBody(request),
        });
        return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
      }
      if (
        action === "complete_operations_review" ||
        action === "approve_and_apply_signature"
      ) {
        if (!options.verifyApprovalToken || !options.approvalActions) {
          throw new OspApiError("INVALID_REQUEST");
        }
        const names = action === "complete_operations_review"
          ? [
            "action",
            "case_id",
            "expected_case_version",
            "input_snapshot_sha256",
            "idempotency_key",
          ]
          : [
            "action",
            "case_id",
            "expected_case_version",
            "input_snapshot_sha256",
            "signature_position_version",
            "idempotency_key",
          ];
        const query = exactQuery(url, names);
        await requireEmptyBody(request);
        const expectedCaseVersion = Number(query.expected_case_version);
        if (
          !UUID.test(query.case_id) ||
          !Number.isSafeInteger(expectedCaseVersion) ||
          expectedCaseVersion < 0 || expectedCaseVersion > 2_147_483_647 ||
          !SHA.test(query.input_snapshot_sha256) ||
          !OPAQUE.test(query.idempotency_key)
        ) throw new OspApiError("INVALID_REQUEST");
        const verified = await options.verifyApprovalToken(
          bearer(request),
          approvalProof(request),
          request.signal,
        );
        const common = {
          caseId: query.case_id,
          expectedCaseVersion,
          inputSnapshotSha256: query.input_snapshot_sha256,
          idempotencyKey: query.idempotency_key,
        };
        if (action === "complete_operations_review") {
          const result = await options.approvalActions.completeOperations(
            common,
            verified,
          );
          return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
        }
        const signaturePositionVersion = Number(
          query.signature_position_version,
        );
        if (
          !Number.isSafeInteger(signaturePositionVersion) ||
          signaturePositionVersion < 1 ||
          signaturePositionVersion > 2_147_483_647
        ) throw new OspApiError("INVALID_REQUEST");
        const result = await options.approvalActions.approveSignature({
          ...common,
          signaturePositionVersion,
        }, verified);
        return jsonResponse({ data: result }, 202, postCorsHeaders(allowed));
      }
      if (action === "save_outbound_draft") {
        if (!options.outboundActions) throw new OspApiError("INVALID_REQUEST");
        const query = exactQuery(url, [
          "action",
          "case_id",
          "expected_case_version",
          "source_snapshot_sha256",
          "signed_package_sha256",
        ]);
        const verified = await options.verifyToken(
          bearer(request),
          request.signal,
        );
        const scope = authority(verified, "operate");
        const expectedCaseVersion = Number(query.expected_case_version);
        const signedPackageSha256 = query.signed_package_sha256 === "none"
          ? null
          : query.signed_package_sha256;
        if (
          !UUID.test(query.case_id) ||
          !Number.isSafeInteger(expectedCaseVersion) ||
          expectedCaseVersion < 0 || expectedCaseVersion > 2_147_483_647 ||
          !SHA.test(query.source_snapshot_sha256) ||
          (signedPackageSha256 !== null && !SHA.test(signedPackageSha256))
        ) throw new OspApiError("INVALID_REQUEST");
        const draft = await outboundDraftBody(request, {
          organizationId: scope.organizationId,
          caseId: query.case_id,
          expectedCaseVersion,
          sourceSnapshotSha256: query.source_snapshot_sha256,
          signedPackageSha256,
        });
        const saved = await options.outboundActions.saveDraft({
          organizationId: scope.organizationId,
          caseId: query.case_id,
          expectedCaseVersion,
          sourceSnapshotSha256: query.source_snapshot_sha256,
          signedPackageSha256,
          draft,
        }, verified);
        return jsonResponse({ data: saved }, 201, postCorsHeaders(allowed));
      }
      if (action === "freeze_outbound_payload") {
        if (!options.outboundActions) throw new OspApiError("INVALID_REQUEST");
        const query = exactQuery(url, [
          "action",
          "case_id",
          "payload_id",
          "expected_case_version",
          "idempotency_key",
        ]);
        await requireEmptyBody(request);
        const expectedCaseVersion = Number(query.expected_case_version);
        if (
          !UUID.test(query.case_id) || !UUID.test(query.payload_id) ||
          !Number.isSafeInteger(expectedCaseVersion) ||
          expectedCaseVersion < 0 || expectedCaseVersion > 2_147_483_647 ||
          !OPAQUE.test(query.idempotency_key)
        ) {
          throw new OspApiError("INVALID_REQUEST");
        }
        const verified = await options.verifyToken(
          bearer(request),
          request.signal,
        );
        const scope = authority(verified, "operate");
        const frozen = await options.outboundActions.freezePayload({
          organizationId: scope.organizationId,
          caseId: query.case_id,
          payloadId: query.payload_id,
          expectedCaseVersion,
          idempotencyKey: query.idempotency_key,
        }, verified);
        return jsonResponse(
          {
            data: {
              payloadId: frozen.payloadId,
              caseId: frozen.caseId,
              caseVersion: frozen.caseVersion,
              kind: frozen.kind,
              mimeSha256: frozen.mimeSha256,
              attachmentSha256: frozen.attachmentSha256,
              replayed: frozen.replayed,
            },
          },
          201,
          postCorsHeaders(allowed),
        );
      }
      if (action === "authorize_outbound_payload") {
        if (!options.outboundActions || !options.verifyApprovalToken) {
          throw new OspApiError("INVALID_REQUEST");
        }
        const query = exactQuery(url, [
          "action",
          "attachment_sha256s",
          "case_id",
          "expected_case_version",
          "idempotency_key",
          "payload_id",
          "payload_sha256",
        ]);
        await requireEmptyBody(request);
        const expectedCaseVersion = Number(query.expected_case_version);
        if (
          !UUID.test(query.case_id) || !UUID.test(query.payload_id) ||
          !SHA.test(query.payload_sha256) ||
          !Number.isSafeInteger(expectedCaseVersion) ||
          expectedCaseVersion < 0 || expectedCaseVersion > 2_147_483_647 ||
          !OPAQUE.test(query.idempotency_key)
        ) throw new OspApiError("INVALID_REQUEST");
        const verified = await options.verifyApprovalToken(
          bearer(request),
          approvalProof(request),
          request.signal,
        );
        const result = await options.outboundActions.authorizePayload({
          organizationId: verified.identity.organization,
          caseId: query.case_id,
          payloadId: query.payload_id,
          payloadSha256: query.payload_sha256,
          attachmentSha256: attachmentHashes(query.attachment_sha256s),
          expectedCaseVersion,
          idempotencyKey: query.idempotency_key,
        }, verified);
        return jsonResponse({ data: result }, 202, postCorsHeaders(allowed));
      }
      if (action === "request_authorized_send") {
        if (!options.outboundActions || !options.verifyApprovalToken) {
          throw new OspApiError("INVALID_REQUEST");
        }
        const query = exactQuery(url, [
          "action",
          "case_id",
          "expected_case_version",
          "idempotency_key",
          "payload_sha256",
          "sales_authorization_id",
        ]);
        await requireEmptyBody(request);
        const expectedCaseVersion = Number(query.expected_case_version);
        if (
          !UUID.test(query.case_id) ||
          !UUID.test(query.sales_authorization_id) ||
          !SHA.test(query.payload_sha256) ||
          !Number.isSafeInteger(expectedCaseVersion) ||
          expectedCaseVersion < 0 || expectedCaseVersion > 2_147_483_647 ||
          !OPAQUE.test(query.idempotency_key)
        ) throw new OspApiError("INVALID_REQUEST");
        const verified = await options.verifyApprovalToken(
          bearer(request),
          approvalProof(request),
          request.signal,
        );
        const result = await options.outboundActions.requestSend({
          organizationId: verified.identity.organization,
          caseId: query.case_id,
          salesAuthorizationId: query.sales_authorization_id,
          payloadSha256: query.payload_sha256,
          expectedCaseVersion,
          idempotencyKey: query.idempotency_key,
        }, verified);
        return jsonResponse({ data: result }, 202, postCorsHeaders(allowed));
      }
      throw new OspApiError("INVALID_REQUEST");
    } catch (error) {
      if (
        error instanceof Error &&
        /^(?:VERSION_CONFLICT|APPROVAL_VERSION_CONFLICT|OUTBOUND_VERSION_CONFLICT|OUTBOUND_SEND_STALE|OUTBOUND_SEND_ALREADY_RESERVED)$/
          .test(error.message)
      ) {
        return versionConflictResponse(incident(nextIncident), allowedOrigin);
      }
      return errorResponse(
        error instanceof OspApiError ? error : serviceError(error),
        incident(nextIncident),
        allowedOrigin,
      );
    }
  };
}
