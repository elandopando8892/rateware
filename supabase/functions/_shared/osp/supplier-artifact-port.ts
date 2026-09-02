import { sha256Hex } from "./source-hash.ts";

export type SupplierArtifactRoute =
  | { kind: "official_portal"; humanTaskUrl: string }
  | { kind: "pdf_acroform" }
  | { kind: "pdf_flat" }
  | { kind: "xlsx" }
  | { kind: "docx" }
  | { kind: "generated_form" };

export type AppliedArtifactMapping = {
  kind:
    | "acroform"
    | "pdf_overlay"
    | "pdf_appendix"
    | "xlsx_cell"
    | "docx_content_control"
    | "docx_appendix";
  mappingDecisionId: string;
  canonicalFieldId: string;
  target: string;
};

export type SupplierArtifactReceipt = {
  sourceVersionId: string;
  sourceSha256: string;
  packageSnapshotId: string;
  packageSnapshotSha256: string;
  outputSha256: string;
  version: number;
  contentType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/vnd.ms-excel.sheet.macroEnabled.12"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  mappings: readonly AppliedArtifactMapping[];
  formCoverage?: Readonly<{
    visiblePageCount: number;
    writableFieldCount: number;
    completedWritableFieldCount: number;
    completionPercent: number;
    blankWritableTargets: readonly string[];
    macroPreserved: boolean;
    printerSettingsPreserved: boolean;
  }>;
};

export type SupplierArtifactContext = {
  sourceVersionId: string;
  sourceBytes: Uint8Array;
  sourceSha256: string;
  packageSnapshotId: string;
  packageSnapshotSha256: string;
  approvedMappingDecisionIds: readonly string[];
  version: number;
  sourceContentType?:
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/vnd.ms-excel.sheet.macroEnabled.12";
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const CANONICAL_FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index]);
}

export function classifySupplierArtifact(
  input:
    | { kind: "portal"; portalUrl: string }
    | { kind: "file"; contentType: string; hasAcroForm?: boolean }
    | { kind: "none" },
): SupplierArtifactRoute {
  if (!input || typeof input !== "object") {
    throw new Error("ARTIFACT_ROUTE_INVALID");
  }
  if (input.kind === "portal") {
    if (!exactKeys(input, ["kind", "portalUrl"])) {
      throw new Error("ARTIFACT_ROUTE_INVALID");
    }
    try {
      const url = new URL(input.portalUrl);
      if (
        url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || url.pathname === "/"
      ) throw new Error("ARTIFACT_ROUTE_INVALID");
      return Object.freeze({
        kind: "official_portal",
        humanTaskUrl: url.toString(),
      });
    } catch {
      throw new Error("ARTIFACT_ROUTE_INVALID");
    }
  }
  if (input.kind === "none") {
    if (!exactKeys(input, ["kind"])) throw new Error("ARTIFACT_ROUTE_INVALID");
    return Object.freeze({ kind: "generated_form" });
  }
  if (input.kind !== "file") throw new Error("ARTIFACT_ROUTE_INVALID");
  if (input.contentType === "application/pdf") {
    if (
      !exactKeys(input, ["kind", "contentType", "hasAcroForm"]) ||
      typeof input.hasAcroForm !== "boolean"
    ) throw new Error("ARTIFACT_ROUTE_INVALID");
    return Object.freeze({
      kind: input.hasAcroForm ? "pdf_acroform" : "pdf_flat",
    });
  }
  if (
    input.contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    if (!exactKeys(input, ["kind", "contentType"])) {
      throw new Error("ARTIFACT_ROUTE_INVALID");
    }
    return Object.freeze({ kind: "xlsx" });
  }
  if (
    input.contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (!exactKeys(input, ["kind", "contentType"])) {
      throw new Error("ARTIFACT_ROUTE_INVALID");
    }
    return Object.freeze({ kind: "docx" });
  }
  throw new Error("ARTIFACT_ROUTE_INVALID");
}

export async function validateArtifactContext(
  input: SupplierArtifactContext,
): Promise<void> {
  if (
    !input || !UUID.test(input.sourceVersionId) ||
    !UUID.test(input.packageSnapshotId) || !SHA.test(input.sourceSha256) ||
    !SHA.test(input.packageSnapshotSha256) ||
    !(input.sourceBytes instanceof Uint8Array) ||
    input.sourceBytes.byteLength < 1 ||
    input.sourceBytes.byteLength > MAX_ARTIFACT_BYTES ||
    !Array.isArray(input.approvedMappingDecisionIds) ||
    input.approvedMappingDecisionIds.length < 1 ||
    input.approvedMappingDecisionIds.length > 10_000 ||
    input.approvedMappingDecisionIds.some((id) =>
      typeof id !== "string" || !UUID.test(id)
    ) ||
    new Set(input.approvedMappingDecisionIds).size !==
      input.approvedMappingDecisionIds.length ||
    !Number.isSafeInteger(input.version) || input.version < 1 ||
    input.version > 2_147_483_647
  ) {
    throw new Error("ARTIFACT_INPUT_INVALID");
  }
  if (await sha256Hex(input.sourceBytes) !== input.sourceSha256) {
    throw new Error("ARTIFACT_SOURCE_MISMATCH");
  }
}

export function validateReviewedMappingSet(
  input: SupplierArtifactContext,
  mappingDecisionIds: readonly string[],
): void {
  // A single human review decision may approve several field-to-target
  // mappings in the same reviewed form. Compare decision identities as sets;
  // target uniqueness is enforced by the format-specific completer.
  const expected = [...new Set(input.approvedMappingDecisionIds)].sort();
  const actual = [...new Set(mappingDecisionIds)].sort();
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => id !== actual[index])
  ) throw new Error("ARTIFACT_MAPPING_INVALID");
}

export function validateMappingIdentity(
  mappingDecisionId: unknown,
  canonicalFieldId: unknown,
): void {
  if (
    typeof mappingDecisionId !== "string" || !UUID.test(mappingDecisionId) ||
    typeof canonicalFieldId !== "string" ||
    !CANONICAL_FIELD.test(canonicalFieldId)
  ) {
    throw new Error("ARTIFACT_MAPPING_INVALID");
  }
}

export function validateArtifactValue(
  value: unknown,
): asserts value is string | number | boolean {
  const containsControlCharacters = typeof value === "string" &&
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 8 || code === 11 || code === 12 ||
        code >= 14 && code <= 31 || code === 127;
    });
  const valid = typeof value === "string"
    ? value.length >= 1 && value.length <= 10_000 && !containsControlCharacters
    : typeof value === "number"
    ? Number.isFinite(value)
    : typeof value === "boolean";
  if (!valid) throw new Error("ARTIFACT_MAPPING_INVALID");
}

export async function artifactReceipt(
  input: SupplierArtifactContext,
  contentType: SupplierArtifactReceipt["contentType"],
  bytes: Uint8Array,
  mappings: readonly AppliedArtifactMapping[],
  formCoverage?: SupplierArtifactReceipt["formCoverage"],
): Promise<SupplierArtifactReceipt> {
  const outputSha256 = await sha256Hex(bytes);
  return Object.freeze({
    sourceVersionId: input.sourceVersionId,
    sourceSha256: input.sourceSha256,
    packageSnapshotId: input.packageSnapshotId,
    packageSnapshotSha256: input.packageSnapshotSha256,
    outputSha256,
    version: input.version,
    contentType,
    mappings: Object.freeze(
      mappings.map((mapping) => Object.freeze({ ...mapping })),
    ),
    ...(formCoverage
      ? {
        formCoverage: Object.freeze({
          ...formCoverage,
          blankWritableTargets: Object.freeze([
            ...formCoverage.blankWritableTargets,
          ]),
        }),
      }
      : {}),
  });
}
