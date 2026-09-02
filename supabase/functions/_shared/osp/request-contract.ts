export type RequestContractCondition =
  | "always"
  | "legal_entity_is_company"
  | "unknown";

export type RequestContractSignatureMethod =
  | "wet"
  | "digital"
  | "either"
  | "none";

export type RequestContractRequirement = Readonly<{
  id: string;
  kind: "form" | "document";
  canonicalKey: string;
  label: string;
  required: boolean;
  condition: RequestContractCondition;
  acceptedContentTypes: readonly string[];
  maximumAgeDays: number | null;
  minimumPageCount: number | null;
  minimumCompletionPercent: number | null;
  signatureMethod: RequestContractSignatureMethod;
  evidenceIds: readonly string[];
}>;

export type RequestContract = Readonly<{
  schemaVersion: 1;
  manifestSha256: string;
  requestType:
    | "customer_setup"
    | "credit_application"
    | "compliance_update"
    | "unknown";
  targetXbfEntity: "XBFMX" | "XBFUS" | "unknown";
  requirements: readonly RequestContractRequirement[];
}>;

export type FulfillmentEvidence = Readonly<{
  evidenceId: string;
  canonicalKey: string;
  label: string;
  contentType: string;
  status: "approved" | "review_required" | "rejected";
  validFrom: string | null;
  expiresAt: string | null;
  pageCount: number | null;
  completionPercent: number | null;
  signatureMethod: RequestContractSignatureMethod;
  includedForOutbound: boolean;
}>;

export type RequestFulfillmentItemStatus =
  | "satisfied"
  | "missing"
  | "stale"
  | "wrong_format"
  | "incomplete"
  | "signature_missing"
  | "not_attached"
  | "review_required"
  | "not_applicable"
  | "waived";

export type RequestFulfillmentItem = Readonly<{
  requirementId: string;
  kind: "form" | "document";
  canonicalKey: string;
  label: string;
  status: RequestFulfillmentItemStatus;
  blocking: boolean;
  reason: string;
  evidenceIds: readonly string[];
}>;

export type RequestFulfillmentMatrix = Readonly<{
  schemaVersion: 1;
  manifestSha256: string;
  assessedAt: string;
  totalRequired: number;
  satisfiedRequired: number;
  blockingCount: number;
  items: readonly RequestFulfillmentItem[];
  gates: Readonly<{
    operationsReview: boolean;
    signatureApproval: boolean;
    outboundDraft: boolean;
    outboundFreeze: boolean;
    salesAuthorization: boolean;
    send: boolean;
  }>;
}>;

type ManifestLike = Readonly<{
  requestType?: unknown;
  targetXbfEntity?: unknown;
  forms?: unknown;
  requestedDocuments?: unknown;
  requirements?: unknown;
}>;

type EntityContext = Readonly<{
  legalEntityKind: "company" | "individual" | "unknown";
}>;

const SHA = /^[0-9a-f]{64}$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/;
const CONTENT_TYPES = Object.freeze({
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
const SIGNABLE_SOURCE_CONTENT_TYPES: readonly string[] = Object.freeze([
  CONTENT_TYPES.pdf,
  CONTENT_TYPES.xlsx,
  CONTENT_TYPES.xlsm,
]);

const DOCUMENT_CONCEPTS: readonly Readonly<{
  canonicalKey: string;
  pattern: RegExp;
}>[] = Object.freeze([
  Object.freeze({
    canonicalKey: "legal.articles_of_incorporation",
    pattern:
      /acta\s+constitutiva|articles\s+of\s+incorporation|certificate\s+of\s+formation/i,
  }),
  Object.freeze({
    canonicalKey: "identity.legal_representative",
    pattern:
      /(?:\bine\b|identificaci[oó]n).{0,40}representante|legal\s+representative\s+id/i,
  }),
  Object.freeze({
    canonicalKey: "legal.power_of_attorney",
    pattern: /poder\s+notarial|power\s+of\s+attorney/i,
  }),
  Object.freeze({
    canonicalKey: "fiscal.sat_compliance_opinion",
    pattern:
      /opini[oó]n\s+(?:positiva|de\s+cumplimiento)|sat\s+(?:positive|compliance)/i,
  }),
  Object.freeze({
    canonicalKey: "fiscal.tax_status_certificate",
    pattern:
      /constancia(?:\s+de)?\s+situaci[oó]n\s+fiscal|tax\s+status\s+certificate/i,
  }),
  Object.freeze({
    canonicalKey: "banking.account_evidence",
    pattern:
      /car[aá]tula.{0,20}banco|bank\s+account\s+(?:evidence|verification)|voided\s+check/i,
  }),
  Object.freeze({
    canonicalKey: "legal.proof_of_address",
    pattern:
      /comprobante(?:\s+de)?\s+domicilio|proof\s+of\s+address|address\s+proof/i,
  }),
  Object.freeze({
    canonicalKey: "fiscal.w9",
    pattern: /(?:^|\W)w[ -]?9(?:\W|$)|irs\s+form\s+w-9/i,
  }),
  Object.freeze({
    canonicalKey: "operations.broker_authority",
    pattern: /broker\s+authority|mc\s+authority|operating\s+authority/i,
  }),
  Object.freeze({
    canonicalKey: "insurance.surety_bond",
    pattern: /bond\s+insurance|surety\s+bond|broker\s+bond/i,
  }),
]);

function text(value: unknown, maximum = 10_000): string {
  if (
    typeof value !== "string" || value.trim() !== value || value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error("REQUEST_CONTRACT_INVALID");
  }
  return value;
}

function stringArray(value: unknown, maximum: number): readonly string[] {
  if (
    !Array.isArray(value) || value.length > maximum ||
    value.some((item) =>
      typeof item !== "string" || item.length < 1 || item.length > 256
    )
  ) {
    throw new Error("REQUEST_CONTRACT_INVALID");
  }
  return Object.freeze([...new Set(value as string[])]);
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function safeKey(value: string): string {
  const candidate = normalized(value).replace(/[^a-z0-9]+/g, ".").replace(
    /^\.+|\.+$/g,
    "",
  ).slice(0, 128);
  return KEY.test(candidate) ? candidate : "unknown.requirement";
}

function documentKey(label: string): string {
  return DOCUMENT_CONCEPTS.find((candidate) => candidate.pattern.test(label))
    ?.canonicalKey ?? `supplier.${safeKey(label)}`;
}

function allRequirementText(manifest: ManifestLike): readonly string[] {
  if (!Array.isArray(manifest.requirements)) return Object.freeze([]);
  return Object.freeze(manifest.requirements.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const value = (item as Record<string, unknown>).text;
    return typeof value === "string" && value.trim() === value ? [value] : [];
  }));
}

function relatedText(
  label: string,
  requirementText: readonly string[],
): string {
  const concept = documentKey(label);
  const matches = requirementText.filter((item) =>
    documentKey(item) === concept ||
    normalized(item).includes(normalized(label))
  );
  return [label, ...matches].join(" \n");
}

function relatedFormText(
  label: string,
  requirementText: readonly string[],
  formCount: number,
): string {
  if (formCount === 1) return [label, ...requirementText].join(" \n");
  const normalizedLabel = normalized(label);
  const meaningfulTokens = normalizedLabel.split(/[^a-z0-9]+/).filter((token) =>
    token.length >= 4
  );
  const matches = requirementText.filter((item) => {
    const candidate = normalized(item);
    return candidate.includes(normalizedLabel) ||
      meaningfulTokens.some((token) => candidate.includes(token));
  });
  return [label, ...matches].join(" \n");
}

function maximumAgeDays(value: string): number | null {
  if (
    /antig[uü]edad\s+m[aá]xima\s+de\s+un\s+mes|maximum\s+age\s+of\s+(?:one|1)\s+month/i
      .test(value)
  ) return 31;
  const months = /(?:antig[uü]edad|vigencia).{0,40}?(\d+)\s+mes/i.exec(value);
  if (months) return Math.min(3650, Number(months[1]) * 31);
  const days =
    /(?:antig[uü]edad|vigencia|maximum\s+age).{0,40}?(\d+)\s+d[ií]as?/i.exec(
      value,
    );
  return days ? Math.min(3650, Number(days[1])) : null;
}

function condition(value: string): RequestContractCondition {
  if (
    /solo\s+para\s+personas?\s+morales?|en\s+caso\s+de\s+ser\s+persona\s+moral|if\s+(?:a\s+)?(?:company|legal\s+entity)/i
      .test(value)
  ) return "legal_entity_is_company";
  if (/\bsi\s+aplica\b|\bif\s+applicable\b/i.test(value)) return "unknown";
  return "always";
}

function acceptedContentTypes(
  value: string,
  sourceFormat?: string,
): readonly string[] {
  if (/formato\s+pdf|in\s+pdf\s+format|\.pdf\b/i.test(value)) {
    return Object.freeze([CONTENT_TYPES.pdf]);
  }
  if (sourceFormat === "xlsm") return Object.freeze([CONTENT_TYPES.xlsm]);
  if (sourceFormat === "xlsx") return Object.freeze([CONTENT_TYPES.xlsx]);
  if (sourceFormat === "docx") return Object.freeze([CONTENT_TYPES.docx]);
  if (sourceFormat === "pdf") return Object.freeze([CONTENT_TYPES.pdf]);
  return Object.freeze([]);
}

function pageCount(value: string): number | null {
  if (/dos\s+p[aá]ginas|two\s+pages/i.test(value)) return 2;
  const match = /(\d+)\s+p[aá]ginas?|(?:pages?)\s*[:=]?\s*(\d+)/i.exec(value);
  return match ? Number(match[1] ?? match[2]) : null;
}

function completionPercent(value: string): number | null {
  const match = /(\d{1,3})\s*%/.exec(value);
  return match ? Math.min(100, Number(match[1])) : null;
}

function signatureMethod(
  value: string,
  required: boolean,
): RequestContractSignatureMethod {
  if (!required) return "none";
  if (
    /firma\s+aut[oó]grafa|wet(?:-ink)?\s+signature|handwritten\s+signature/i
      .test(value)
  ) return "wet";
  if (/firma\s+electr[oó]nica|digital\s+signature|e-signature/i.test(value)) {
    return "digital";
  }
  return "either";
}

function requirementId(
  kind: "form" | "document",
  canonicalKey: string,
  index: number,
): string {
  return `${kind}:${canonicalKey}:${index + 1}`;
}

export function buildRequestContract(
  input: Readonly<{
    manifestSha256: string;
    manifest: ManifestLike;
  }>,
): RequestContract {
  if (
    !SHA.test(input.manifestSha256) || !input.manifest ||
    typeof input.manifest !== "object"
  ) throw new Error("REQUEST_CONTRACT_INVALID");
  const requirementText = allRequirementText(input.manifest);
  const forms = Array.isArray(input.manifest.forms) ? input.manifest.forms : [];
  const documents = Array.isArray(input.manifest.requestedDocuments)
    ? input.manifest.requestedDocuments
    : [];
  const requirements: RequestContractRequirement[] = [];
  forms.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("REQUEST_CONTRACT_INVALID");
    }
    const row = item as Record<string, unknown>;
    const label = text(row.name, 256);
    const format = text(row.format, 16);
    const evidenceIds = stringArray(row.evidenceIds, 20);
    if (typeof row.required !== "boolean") {
      throw new Error("REQUEST_CONTRACT_INVALID");
    }
    const combined = relatedFormText(label, requirementText, forms.length);
    const canonicalKey = `form.${safeKey(label)}`;
    const requiresSignature = row.action === "sign" ||
      /firma|signature/i.test(combined);
    requirements.push(Object.freeze({
      id: requirementId("form", canonicalKey, index),
      kind: "form",
      canonicalKey,
      label,
      required: row.required,
      condition: condition(combined),
      acceptedContentTypes: acceptedContentTypes(combined, format),
      maximumAgeDays: null,
      minimumPageCount: pageCount(combined),
      minimumCompletionPercent: completionPercent(combined),
      signatureMethod: signatureMethod(combined, requiresSignature),
      evidenceIds,
    }));
  });
  documents.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("REQUEST_CONTRACT_INVALID");
    }
    const row = item as Record<string, unknown>;
    const label = text(row.documentType, 256);
    const evidenceIds = stringArray(row.evidenceIds, 20);
    if (typeof row.required !== "boolean") {
      throw new Error("REQUEST_CONTRACT_INVALID");
    }
    const combined = relatedText(label, requirementText);
    const canonicalKey = documentKey(label);
    requirements.push(Object.freeze({
      id: requirementId("document", canonicalKey, index),
      kind: "document",
      canonicalKey,
      label,
      required: row.required,
      condition: condition(combined),
      acceptedContentTypes: acceptedContentTypes(combined),
      maximumAgeDays: maximumAgeDays(combined),
      minimumPageCount: null,
      minimumCompletionPercent: null,
      signatureMethod: "none",
      evidenceIds,
    }));
  });
  if (
    requirements.length < 1 || requirements.length > 600 ||
    new Set(requirements.map((item) => item.id)).size !== requirements.length
  ) {
    throw new Error("REQUEST_CONTRACT_INVALID");
  }
  const requestType =
    ["customer_setup", "credit_application", "compliance_update", "unknown"]
        .includes(String(input.manifest.requestType))
      ? input.manifest.requestType as RequestContract["requestType"]
      : "unknown";
  const targetXbfEntity = ["XBFMX", "XBFUS", "unknown"].includes(
      String(input.manifest.targetXbfEntity),
    )
    ? input.manifest.targetXbfEntity as RequestContract["targetXbfEntity"]
    : "unknown";
  return Object.freeze({
    schemaVersion: 1,
    manifestSha256: input.manifestSha256,
    requestType,
    targetXbfEntity,
    requirements: Object.freeze(requirements),
  });
}

function applies(
  requirement: RequestContractRequirement,
  entity: EntityContext,
): boolean | null {
  if (requirement.condition === "always") return true;
  if (requirement.condition === "legal_entity_is_company") {
    return entity.legalEntityKind === "unknown"
      ? null
      : entity.legalEntityKind === "company";
  }
  return null;
}

function daysBetween(left: string, right: Date): number | null {
  const timestamp = Date.parse(`${left}T00:00:00Z`);
  return Number.isFinite(timestamp)
    ? Math.floor((right.getTime() - timestamp) / 86_400_000)
    : null;
}

type CandidateIssue = Readonly<{
  status: "stale" | "incomplete" | "signature_missing" | "not_attached";
  reason: string;
}>;

function candidateIssue(
  requirement: RequestContractRequirement,
  candidate: FulfillmentEvidence,
  now: Date,
  requireOutboundAttachment = true,
): CandidateIssue | null {
  if (requirement.maximumAgeDays !== null) {
    const age = candidate.validFrom
      ? daysBetween(candidate.validFrom, now)
      : null;
    const expired = candidate.expiresAt
      ? Date.parse(`${candidate.expiresAt}T23:59:59Z`) < now.getTime()
      : false;
    if (
      age === null || age < 0 || age > requirement.maximumAgeDays || expired
    ) {
      return Object.freeze({
        status: "stale",
        reason:
          `Evidence must be no older than ${requirement.maximumAgeDays} days.`,
      });
    }
  }
  if (
    (requirement.minimumPageCount !== null &&
      (candidate.pageCount ?? 0) < requirement.minimumPageCount) ||
    (requirement.minimumCompletionPercent !== null &&
      (candidate.completionPercent ?? 0) < requirement.minimumCompletionPercent)
  ) {
    return Object.freeze({
      status: "incomplete",
      reason: `Requires at least ${
        requirement.minimumPageCount ?? 1
      } pages and ${requirement.minimumCompletionPercent ?? 0}% completion.`,
    });
  }
  if (
    requirement.signatureMethod !== "none" &&
    candidate.signatureMethod !== requirement.signatureMethod &&
    !(requirement.signatureMethod === "either" &&
      candidate.signatureMethod !== "none")
  ) {
    return Object.freeze({
      status: "signature_missing",
      reason: `Requires ${requirement.signatureMethod} signature evidence.`,
    });
  }
  if (requireOutboundAttachment && !candidate.includedForOutbound) {
    return Object.freeze({
      status: "not_attached",
      reason:
        "Reviewed evidence is not included in the exact outbound payload.",
    });
  }
  return null;
}

function evaluateRequirement(
  requirement: RequestContractRequirement,
  evidence: readonly FulfillmentEvidence[],
  entity: EntityContext,
  now: Date,
): RequestFulfillmentItem {
  const applicable = applies(requirement, entity);
  if (applicable === false) {
    return Object.freeze({
      requirementId: requirement.id,
      kind: requirement.kind,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      status: "not_applicable",
      blocking: false,
      reason: "Condition does not apply to this legal entity.",
      evidenceIds: Object.freeze([]),
    });
  }
  if (applicable === null) {
    return Object.freeze({
      requirementId: requirement.id,
      kind: requirement.kind,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      status: "review_required",
      blocking: requirement.required,
      reason: "A human must resolve the applicability condition.",
      evidenceIds: Object.freeze([]),
    });
  }
  const candidates = evidence.filter((item) =>
    item.canonicalKey === requirement.canonicalKey
  );
  if (candidates.length === 0) {
    return Object.freeze({
      requirementId: requirement.id,
      kind: requirement.kind,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      status: "missing",
      blocking: requirement.required,
      reason: "No matching evidence is attached.",
      evidenceIds: Object.freeze([]),
    });
  }
  const approved = candidates.filter((item) => item.status === "approved");
  if (approved.length === 0) {
    return Object.freeze({
      requirementId: requirement.id,
      kind: requirement.kind,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      status: "review_required",
      blocking: requirement.required,
      reason: "Matching evidence still requires human approval.",
      evidenceIds: Object.freeze(candidates.map((item) => item.evidenceId)),
    });
  }
  const matchingFormat = approved.filter((item) =>
    requirement.acceptedContentTypes.length === 0 ||
    requirement.acceptedContentTypes.includes(item.contentType)
  );
  if (matchingFormat.length === 0) {
    return Object.freeze({
      requirementId: requirement.id,
      kind: requirement.kind,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      status: "wrong_format",
      blocking: requirement.required,
      reason: `Expected ${requirement.acceptedContentTypes.join(" or ")}.`,
      evidenceIds: Object.freeze(approved.map((item) => item.evidenceId)),
    });
  }
  const assessed = matchingFormat.map((candidate) => ({
    candidate,
    issue: candidateIssue(requirement, candidate, now),
  }));
  const satisfied = assessed.find((item) => item.issue === null)?.candidate;
  if (!satisfied) {
    const priority = {
      stale: 1,
      incomplete: 2,
      signature_missing: 3,
      not_attached: 4,
    } as const;
    const closest = [...assessed].sort((left, right) =>
      priority[right.issue!.status] - priority[left.issue!.status]
    )[0];
    return Object.freeze({
      requirementId: requirement.id,
      kind: requirement.kind,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      status: closest.issue!.status,
      blocking: requirement.required,
      reason: closest.issue!.reason,
      evidenceIds: Object.freeze([closest.candidate.evidenceId]),
    });
  }
  return Object.freeze({
    requirementId: requirement.id,
    kind: requirement.kind,
    canonicalKey: requirement.canonicalKey,
    label: requirement.label,
    status: "satisfied",
    blocking: false,
    reason: "Approved evidence satisfies the request contract.",
    evidenceIds: Object.freeze([satisfied.evidenceId]),
  });
}

function preSignatureReady(
  requirement: RequestContractRequirement,
  evidence: readonly FulfillmentEvidence[],
  entity: EntityContext,
  now: Date,
): boolean {
  const applicable = applies(requirement, entity);
  if (applicable === false || !requirement.required) return true;
  if (applicable === null) return false;
  if (requirement.kind === "document") {
    return evidence.some((candidate) =>
      candidate.canonicalKey === requirement.canonicalKey &&
      candidate.status === "approved" &&
      (requirement.acceptedContentTypes.length === 0 ||
        requirement.acceptedContentTypes.includes(candidate.contentType)) &&
      candidateIssue(requirement, candidate, now, false) === null
    );
  }
  return evidence.some((candidate) => {
    if (
      candidate.canonicalKey !== requirement.canonicalKey ||
      candidate.status !== "approved" ||
      !SIGNABLE_SOURCE_CONTENT_TYPES.includes(candidate.contentType)
    ) return false;
    if (
      requirement.minimumPageCount !== null &&
      (candidate.pageCount ?? 0) < requirement.minimumPageCount
    ) return false;
    if (
      requirement.minimumCompletionPercent !== null &&
      (candidate.completionPercent ?? 0) < requirement.minimumCompletionPercent
    ) return false;
    return true;
  });
}

function readyForOutboundDraft(
  requirement: RequestContractRequirement,
  evidence: readonly FulfillmentEvidence[],
  entity: EntityContext,
  now: Date,
): boolean {
  const applicable = applies(requirement, entity);
  if (applicable === false || !requirement.required) return true;
  if (applicable === null) return false;
  return evidence.some((candidate) =>
    candidate.canonicalKey === requirement.canonicalKey &&
    candidate.status === "approved" &&
    (requirement.acceptedContentTypes.length === 0 ||
      requirement.acceptedContentTypes.includes(candidate.contentType)) &&
    candidateIssue(requirement, candidate, now, false) === null
  );
}

export function evaluateRequestFulfillment(
  input: Readonly<{
    contract: RequestContract;
    evidence: readonly FulfillmentEvidence[];
    entity: EntityContext;
    now?: Date;
  }>,
): RequestFulfillmentMatrix {
  if (
    !input.contract || input.contract.schemaVersion !== 1 ||
    !SHA.test(input.contract.manifestSha256) || !Array.isArray(input.evidence)
  ) throw new Error("REQUEST_FULFILLMENT_INVALID");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("REQUEST_FULFILLMENT_INVALID");
  }
  const ids = new Set<string>();
  for (const item of input.evidence) {
    if (
      !SAFE_ID.test(item.evidenceId) || ids.has(item.evidenceId) ||
      !KEY.test(item.canonicalKey) ||
      typeof item.includedForOutbound !== "boolean"
    ) throw new Error("REQUEST_FULFILLMENT_INVALID");
    ids.add(item.evidenceId);
  }
  const items = input.contract.requirements.map((requirement) =>
    evaluateRequirement(requirement, input.evidence, input.entity, now)
  );
  const required = items.filter((item) =>
    input.contract.requirements.find((requirement) =>
      requirement.id === item.requirementId
    )?.required && item.status !== "not_applicable"
  );
  const blockingCount = items.filter((item) => item.blocking).length;
  const finalReady = blockingCount === 0 && required.length > 0;
  const readyToSign = required.length > 0 &&
    input.contract.requirements.every((requirement) =>
      preSignatureReady(requirement, input.evidence, input.entity, now)
    );
  const readyToDraft = required.length > 0 &&
    input.contract.requirements.every((requirement) =>
      readyForOutboundDraft(requirement, input.evidence, input.entity, now)
    );
  return Object.freeze({
    schemaVersion: 1,
    manifestSha256: input.contract.manifestSha256,
    assessedAt: now.toISOString(),
    totalRequired: required.length,
    satisfiedRequired: required.filter((item) =>
      item.status === "satisfied" || item.status === "waived"
    ).length,
    blockingCount,
    items: Object.freeze(items),
    gates: Object.freeze({
      operationsReview: readyToSign,
      signatureApproval: readyToSign,
      outboundDraft: readyToDraft,
      outboundFreeze: finalReady,
      salesAuthorization: finalReady,
      send: finalReady,
    }),
  });
}

export type RequestSemanticGateStage =
  | "operations_review"
  | "signature_approval"
  | "outbound_draft"
  | "outbound_freeze"
  | "sales_authorization"
  | "send";

export interface RequestSemanticGate {
  load(
    input: { organizationId: string; caseId: string },
  ): Promise<RequestFulfillmentMatrix>;
  requiredOutboundAttachments?(
    input: { organizationId: string; caseId: string },
  ): Promise<readonly RequestOutboundAttachment[]>;
}

export type RequestOutboundAttachment = Readonly<{
  bucketId: "osp-corporate-documents" | "osp-derived-documents";
  objectId: string;
  name: string;
  contentType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/vnd.ms-excel.sheet.macroEnabled.12"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "image/jpeg"
    | "image/png"
    | "image/tiff";
  sha256: string;
}>;

export async function assertRequestSemanticGate(
  gate: RequestSemanticGate,
  input: {
    organizationId: string;
    caseId: string;
    stage: RequestSemanticGateStage;
  },
): Promise<RequestFulfillmentMatrix> {
  const matrix = await gate.load(input);
  const allowed = input.stage === "operations_review"
    ? matrix.gates.operationsReview
    : input.stage === "signature_approval"
    ? matrix.gates.signatureApproval
    : input.stage === "outbound_draft"
    ? matrix.gates.outboundDraft
    : input.stage === "outbound_freeze"
    ? matrix.gates.outboundFreeze
    : input.stage === "sales_authorization"
    ? matrix.gates.salesAuthorization
    : matrix.gates.send;
  if (!allowed) {
    throw new Error("REQUEST_FULFILLMENT_BLOCKED");
  }
  return matrix;
}
