import type {
  RequestManifest,
  RequestManifestEvidence,
  RequestManifestTelemetry,
} from "./openai-request-manifest.ts";
import type { RequestManifestShadowSource } from "./postgres-request-manifest-shadow.ts";
import type { RequestManifestShadowConfiguration } from "./request-manifest-shadow-config.ts";
import { parseXlsxStructure } from "./xlsx-structure.ts";

export type RequestManifestShadowRequest = Readonly<{
  organizationId: string;
  caseId: string;
  gmailMessageId: string;
  gmailSourceSha256: string;
  documentVersionId: string;
  documentSourceSha256: string;
}>;

export type RequestManifestShadowResult = Readonly<{
  manifest: RequestManifest;
  telemetry: RequestManifestTelemetry;
  evidence: Readonly<{
    count: number;
    sha256: string;
    kinds: Readonly<{ emailText: number; xlsxRows: number }>;
  }>;
}>;

type SourcePort = Readonly<{
  load(
    configuration: RequestManifestShadowConfiguration,
  ): Promise<RequestManifestShadowSource>;
}>;

type StoragePort = Readonly<{
  download(bucketId: string, objectKey: string): Promise<Uint8Array | null>;
}>;

type InterpreterPort = Readonly<{
  interpretWithTelemetry(input: {
    evidence: readonly RequestManifestEvidence[];
  }): Promise<
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

function exact(
  configuration: RequestManifestShadowConfiguration,
  request: RequestManifestShadowRequest,
): boolean {
  return configuration.organizationId === request.organizationId &&
    configuration.caseId === request.caseId &&
    configuration.gmailMessageId === request.gmailMessageId &&
    configuration.gmailSourceSha256 === request.gmailSourceSha256 &&
    configuration.documentVersionId === request.documentVersionId &&
    configuration.documentSourceSha256 === request.documentSourceSha256;
}

function rowNumber(address: string): number {
  const match = /([1-9][0-9]*)$/.exec(address);
  if (!match) throw new Error("XLSX_INVALID");
  return Number(match[1]);
}

function xlsxRows(
  versionId: string,
  structure: Awaited<ReturnType<typeof parseXlsxStructure>>,
): RequestManifestEvidence[] {
  const evidence: RequestManifestEvidence[] = [];
  structure.sheets.forEach((sheet, sheetIndex) => {
    const rows = new Map<number, string[]>();
    for (const cell of sheet.cells) {
      const current = rows.get(rowNumber(cell.address)) ?? [];
      current.push(`${cell.address}=${JSON.stringify(cell.value)}`);
      rows.set(rowNumber(cell.address), current);
    }
    for (
      const [row, cells] of [...rows.entries()].sort((left, right) =>
        left[0] - right[0]
      )
    ) {
      evidence.push(Object.freeze({
        id: `xlsx:${versionId}:${sheetIndex + 1}:${row}`,
        kind: "xlsx_cell",
        sourceName: `supplier-requirement.xlsx / ${sheet.name}`,
        content: cells.join(" | "),
      }));
    }
  });
  return evidence;
}

export function createRequestManifestShadowService(options: {
  configuration: RequestManifestShadowConfiguration;
  source: SourcePort;
  storage: StoragePort;
  interpreter: InterpreterPort;
}) {
  let consumed = false;
  return Object.freeze({
    async run(
      request: RequestManifestShadowRequest,
    ): Promise<RequestManifestShadowResult> {
      if (!exact(options.configuration, request) || consumed) {
        throw new Error("SHADOW_NOT_ALLOWED");
      }
      consumed = true;
      const source = await options.source.load(options.configuration);
      const bytes = await options.storage.download(
        source.document.bucketId,
        source.document.objectKey,
      );
      if (!bytes) throw new Error("STORAGE_DOWNLOAD_TEMPORARY");
      if (await sha256(bytes) !== source.document.sourceSha256) {
        throw new Error("SOURCE_HASH_MISMATCH");
      }
      const structure = await parseXlsxStructure({
        sourceVersionId: source.document.versionId,
        bytes,
      });
      const spreadsheetEvidence = xlsxRows(
        source.document.versionId,
        structure,
      );
      const evidence: RequestManifestEvidence[] = [
        Object.freeze({
          id: `email:${source.message.id}`,
          kind: "email_text",
          sourceName: "carrier-request.eml",
          content:
            `Subject: ${source.message.subject}\n\n${source.message.safeBody}`,
        }),
        ...spreadsheetEvidence,
      ];
      if (evidence.length > 300) throw new Error("SHADOW_EVIDENCE_LIMIT");
      const canonical = JSON.stringify(evidence);
      if (canonical.length > 250_000) throw new Error("SHADOW_EVIDENCE_LIMIT");
      const interpreted = await options.interpreter.interpretWithTelemetry({
        evidence,
      });
      return Object.freeze({
        manifest: interpreted.manifest,
        telemetry: interpreted.telemetry,
        evidence: Object.freeze({
          count: evidence.length,
          sha256: await sha256(new TextEncoder().encode(canonical)),
          kinds: Object.freeze({
            emailText: 1,
            xlsxRows: spreadsheetEvidence.length,
          }),
        }),
      });
    },
  });
}
