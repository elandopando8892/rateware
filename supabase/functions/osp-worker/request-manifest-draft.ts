import type {
  RequestManifest,
  RequestManifestAttachment,
  RequestManifestEvidence,
  RequestManifestTelemetry,
} from "./openai-request-manifest.ts";
import {
  parseXlsxStructure,
  XLSM_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from "./xlsx-structure.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const XLSX = XLSX_CONTENT_TYPE;
const XLSM = XLSM_CONTENT_TYPE;
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type RequestManifestDocument = Readonly<{
  versionId: string;
  sourceName: string;
  contentType:
    | typeof XLSX
    | typeof XLSM
    | typeof DOCX
    | "application/pdf"
    | "image/jpeg"
    | "image/png"
    | "image/webp";
  sourceSha256: string;
  sourceSafety: "safe";
  bytes: Uint8Array;
}>;

export type RequestManifestSource = Readonly<{
  organizationId: string;
  caseId: string;
  message: Readonly<{
    id: string;
    sourceSha256: string;
    subject: string;
    safeBody: string;
  }>;
  documents: readonly RequestManifestDocument[];
}>;

export type RequestManifestReadDraft = Readonly<{
  schemaVersion: 1;
  status: "review_required";
  modelVersion: string;
  sourceCount: number;
  sourceCoverage: Readonly<{
    email: number;
    xlsx: number;
    xlsm: number;
    pdf: number;
    docx: number;
    image: number;
  }>;
  spreadsheetProtection: Readonly<{
    macroEnabledFiles: number;
    macroExecution: "blocked";
    analysisMode: "not_required" | "sanitized_copy";
  }>;
  generatedAt: string;
  requestType: RequestManifest["requestType"];
  language: RequestManifest["language"];
  targetXbfEntity: RequestManifest["targetXbfEntity"];
  requesterLegalName: string | null;
  dueDate: string | null;
  forms: RequestManifest["forms"];
  requestedFields: RequestManifest["requestedFields"];
  requestedDocuments: RequestManifest["requestedDocuments"];
  signature: RequestManifest["signature"];
  submission: RequestManifest["submission"];
  requirements: RequestManifest["requirements"];
  contradictions: RequestManifest["contradictions"];
  missingInformation: RequestManifest["missingInformation"];
  clarificationQuestions: RequestManifest["clarificationQuestions"];
  readiness: RequestManifest["readiness"];
  aiGenerated: true;
  externalEffects: false;
}>;

export interface RequestManifestDraftStore {
  findByEvidence(
    input: Readonly<{
      organizationId: string;
      caseId: string;
      evidenceSha256: string;
    }>,
  ): Promise<
    Readonly<{
      manifest: RequestManifestReadDraft;
      telemetry: RequestManifestTelemetry;
      receipt: Readonly<{
        id: string;
        version: number;
        manifestSha256: string;
        replayed: true;
      }>;
    }> | null
  >;
  record(
    input: Readonly<{
      organizationId: string;
      caseId: string;
      manifest: RequestManifestReadDraft;
      manifestSha256: string;
      evidenceSha256: string;
      telemetry: RequestManifestTelemetry;
    }>,
  ): Promise<
    Readonly<{
      id: string;
      version: number;
      manifestSha256: string;
      replayed: boolean;
    }>
  >;
}

type InterpreterPort = Readonly<{
  interpretWithTelemetry(
    input: Readonly<{
      evidence: readonly RequestManifestEvidence[];
      attachments?: readonly RequestManifestAttachment[];
    }>,
  ): Promise<
    Readonly<{
      manifest: RequestManifest;
      telemetry: RequestManifestTelemetry;
    }>
  >;
}>;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function boundedLine(value: string, maximum: number): string {
  if (
    value.trim() !== value || value.length < 1 || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("REQUEST_MANIFEST_SOURCE_INVALID");
  }
  return value;
}

function boundedBody(value: string, maximum: number): string {
  if (
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error("REQUEST_MANIFEST_SOURCE_INVALID");
  }
  return value;
}

function rowNumber(address: string): number {
  const match = /([1-9][0-9]*)$/.exec(address);
  if (!match) throw new Error("XLSX_INVALID");
  return Number(match[1]);
}

function xlsxEvidence(
  versionId: string,
  sourceName: string,
  structure: Awaited<ReturnType<typeof parseXlsxStructure>>,
): RequestManifestEvidence[] {
  const evidence: RequestManifestEvidence[] = [];
  structure.sheets.forEach((sheet, sheetIndex) => {
    const rows = new Map<number, string[]>();
    for (const cell of sheet.cells) {
      const row = rowNumber(cell.address);
      const current = rows.get(row) ?? [];
      current.push(`${cell.address}=${JSON.stringify(cell.value)}`);
      rows.set(row, current);
    }
    for (
      const [row, cells] of [...rows.entries()].sort((left, right) =>
        left[0] - right[0]
      )
    ) {
      evidence.push(Object.freeze({
        id: `xlsx:${versionId}:${sheetIndex + 1}:${row}`,
        kind: "xlsx_cell",
        sourceName: `${sourceName} / ${sheet.name}`,
        content: cells.join(" | "),
      }));
    }
  });
  return evidence;
}

function attachment(
  document: RequestManifestDocument,
): RequestManifestAttachment {
  if (document.contentType === "application/pdf") {
    return {
      id: `file:${document.versionId}`,
      kind: "pdf_file",
      sourceName: document.sourceName,
      contentType: document.contentType,
      bytes: Uint8Array.from(document.bytes),
    };
  }
  if (document.contentType === DOCX) {
    return {
      id: `file:${document.versionId}`,
      kind: "docx_file",
      sourceName: document.sourceName,
      contentType: document.contentType,
      bytes: Uint8Array.from(document.bytes),
    };
  }
  if (
    ["image/jpeg", "image/png", "image/webp"].includes(document.contentType)
  ) {
    return {
      id: `file:${document.versionId}`,
      kind: "image_file",
      sourceName: document.sourceName,
      contentType: document.contentType,
      bytes: Uint8Array.from(document.bytes),
    } as RequestManifestAttachment;
  }
  throw new Error("REQUEST_MANIFEST_CONTENT_TYPE_UNSUPPORTED");
}

function assertSource(source: RequestManifestSource): void {
  if (
    !UUID.test(source.organizationId) || !UUID.test(source.caseId) ||
    !UUID.test(source.message.id) ||
    !SHA256.test(source.message.sourceSha256) || source.documents.length > 20
  ) {
    throw new Error("REQUEST_MANIFEST_SOURCE_INVALID");
  }
  boundedLine(source.message.subject, 998);
  boundedBody(source.message.safeBody, 40_000);
  const ids = new Set<string>();
  for (const document of source.documents) {
    if (
      !UUID.test(document.versionId) || ids.has(document.versionId) ||
      !SHA256.test(document.sourceSha256) ||
      document.sourceSafety !== "safe" ||
      !(document.bytes instanceof Uint8Array) || document.bytes.byteLength < 1
    ) {
      throw new Error("REQUEST_MANIFEST_SOURCE_INVALID");
    }
    ids.add(document.versionId);
    boundedLine(document.sourceName, 256);
  }
}

function readDraft(
  manifest: RequestManifest,
  telemetry: RequestManifestTelemetry,
  sourceCount: number,
  sourceCoverage: RequestManifestReadDraft["sourceCoverage"],
  spreadsheetProtection: RequestManifestReadDraft["spreadsheetProtection"],
  generatedAt: string,
): RequestManifestReadDraft {
  return Object.freeze({
    schemaVersion: 1,
    status: "review_required",
    modelVersion: telemetry.model,
    sourceCount,
    sourceCoverage,
    spreadsheetProtection,
    generatedAt,
    requestType: manifest.requestType,
    language: manifest.language,
    targetXbfEntity: manifest.targetXbfEntity,
    requesterLegalName: manifest.requesterLegalName.value,
    dueDate: manifest.dueDate.value,
    forms: manifest.forms,
    requestedFields: manifest.requestedFields,
    requestedDocuments: manifest.requestedDocuments,
    signature: manifest.signature,
    submission: manifest.submission,
    requirements: manifest.requirements,
    contradictions: manifest.contradictions,
    missingInformation: manifest.missingInformation,
    clarificationQuestions: manifest.clarificationQuestions,
    readiness: manifest.readiness,
    aiGenerated: true,
    externalEffects: false,
  });
}

export function createRequestManifestDraftService(options: {
  interpreter: InterpreterPort;
  store: RequestManifestDraftStore;
  clock?: () => Date;
}) {
  const clock = options.clock ?? (() => new Date());
  return Object.freeze({
    async run(source: RequestManifestSource) {
      assertSource(source);
      const evidence: RequestManifestEvidence[] = [Object.freeze({
        id: `email:${source.message.id}`,
        kind: "email_text",
        sourceName: "carrier-request.eml",
        content:
          `Subject: ${source.message.subject}\n\n${source.message.safeBody}`,
      })];
      const attachments: RequestManifestAttachment[] = [];
      const coverage = {
        email: 1,
        xlsx: 0,
        xlsm: 0,
        pdf: 0,
        docx: 0,
        image: 0,
      };
      let macroEnabledFiles = 0;
      const documents = [...source.documents].sort((left, right) =>
        left.versionId.localeCompare(right.versionId)
      );
      for (const document of documents) {
        if (await sha256(document.bytes) !== document.sourceSha256) {
          throw new Error("SOURCE_HASH_MISMATCH");
        }
        if ([XLSX, XLSM].includes(document.contentType as typeof XLSX)) {
          const structure = await parseXlsxStructure({
            sourceVersionId: document.versionId,
            bytes: document.bytes,
            contentType: document.contentType as typeof XLSX | typeof XLSM,
          });
          evidence.push(
            ...xlsxEvidence(document.versionId, document.sourceName, structure),
          );
          if (document.contentType === XLSM) {
            if (
              !structure.protection.macroEnabled ||
              structure.protection.analysisMode !== "sanitized_copy" ||
              !structure.protection.analysisSha256 ||
              !structure.protection.macroSha256
            ) throw new Error("XLSM_PACKAGE_POLICY_REJECTED");
            coverage.xlsm += 1;
            macroEnabledFiles += 1;
          } else {
            coverage.xlsx += 1;
          }
        } else {
          attachments.push(attachment(document));
          if (document.contentType === "application/pdf") coverage.pdf += 1;
          else if (document.contentType === DOCX) coverage.docx += 1;
          else coverage.image += 1;
        }
      }
      const evidenceInventory = {
        message: source.message.sourceSha256,
        documents: documents.map((document) => ({
          versionId: document.versionId,
          sourceSha256: document.sourceSha256,
          contentType: document.contentType,
        })),
      };
      const evidenceSha256 = await sha256(
        new TextEncoder().encode(JSON.stringify(evidenceInventory)),
      );
      const replay = await options.store.findByEvidence({
        organizationId: source.organizationId,
        caseId: source.caseId,
        evidenceSha256,
      });
      if (replay) {
        return Object.freeze({
          manifest: replay.manifest,
          telemetry: replay.telemetry,
          evidenceSha256,
          receipt: replay.receipt,
        });
      }
      const interpreted = await options.interpreter.interpretWithTelemetry({
        evidence,
        attachments,
      });
      const generatedAt = clock().toISOString();
      const manifest = readDraft(
        interpreted.manifest,
        interpreted.telemetry,
        1 + documents.length,
        coverage,
        Object.freeze({
          macroEnabledFiles,
          macroExecution: "blocked" as const,
          analysisMode: macroEnabledFiles > 0
            ? "sanitized_copy" as const
            : "not_required" as const,
        }),
        generatedAt,
      );
      const manifestSha256 = await sha256(
        new TextEncoder().encode(JSON.stringify(manifest)),
      );
      const receipt = await options.store.record({
        organizationId: source.organizationId,
        caseId: source.caseId,
        manifest,
        manifestSha256,
        evidenceSha256,
        telemetry: interpreted.telemetry,
      });
      return Object.freeze({
        manifest,
        telemetry: interpreted.telemetry,
        evidenceSha256,
        receipt,
      });
    },
  });
}
