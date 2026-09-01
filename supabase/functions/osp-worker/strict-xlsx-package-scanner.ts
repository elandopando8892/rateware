import JSZip from "npm:jszip@3.10.1";

import { sha256Hex } from "../_shared/osp/source-hash.ts";

const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_XML_BYTES = 1024 * 1024;
const MAX_ENTRIES = 2_000;
const SHA256 = /^[0-9a-f]{64}$/;
const XLSX_MAIN =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const XLSM_MAIN =
  "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
const VBA_CONTENT_TYPE = "application/vnd.ms-office.vbaProject";
const VBA_PATH = "xl/vbaProject.bin";
const FORBIDDEN_PATH =
  /(?:^|\/)(?:activex|embeddings|externallinks|macrosheets|dialogsheets|customui|_xmlsignatures|querytables|webextensions|pivotcache)(?:\/|$)|(?:^|\/)connections\.xml$|\.(?:bin|exe|dll|com|bat|cmd|js|vbs|ps1|jar|msi|scr|hta)$/i;
const FORBIDDEN_XML =
  /macroenabled|vbaproject|activex|oleobject|externallink|attachedtemplate/i;
const FORBIDDEN_XLSM_XML = /activex|oleobject|externallink|attachedtemplate/i;

type ZipEntryMetadata = {
  dir: boolean;
  name: string;
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number; compressedSize?: number };
  async(type: "uint8array"): Promise<Uint8Array>;
};

function validEntryPath(entry: ZipEntryMetadata): boolean {
  const original = entry.unsafeOriginalName ?? entry.name;
  return entry.name === original &&
    entry.name.length >= 1 && entry.name.length <= 512 &&
    !entry.name.startsWith("/") && !entry.name.includes("\\") &&
    !entry.name.split("/").includes("..") &&
    !FORBIDDEN_PATH.test(entry.name);
}

function validMacroEntryPath(entry: ZipEntryMetadata): boolean {
  if (entry.name.toLowerCase() === VBA_PATH.toLowerCase()) {
    const original = entry.unsafeOriginalName ?? entry.name;
    return entry.name === original && !entry.dir;
  }
  return validEntryPath(entry);
}

function assertPackageEnvelope(
  bytes: Uint8Array,
  entries: ZipEntryMetadata[],
  zip: JSZip,
  pathValidator: (entry: ZipEntryMetadata) => boolean,
): void {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 1 ||
    bytes.byteLength > MAX_COMPRESSED_BYTES || entries.length < 4 ||
    entries.length > MAX_ENTRIES || !zip.file("[Content_Types].xml") ||
    !zip.file("_rels/.rels") || !zip.file("xl/workbook.xml") ||
    !zip.file("xl/_rels/workbook.xml.rels") ||
    !entries.some((entry) =>
      /^xl\/worksheets\/sheet[1-9][0-9]*\.xml$/i.test(entry.name)
    )
  ) throw new Error("XLSX_PACKAGE_POLICY_REJECTED");

  let totalUncompressed = 0;
  for (const entry of entries) {
    if (!pathValidator(entry)) throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    if (entry.dir) continue;
    const uncompressed = entry._data?.uncompressedSize;
    const compressed = entry._data?.compressedSize;
    if (
      !Number.isSafeInteger(uncompressed) ||
      !Number.isSafeInteger(compressed) ||
      (uncompressed as number) < 0 || (compressed as number) < 0 ||
      (uncompressed as number) > MAX_ENTRY_BYTES
    ) throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    totalUncompressed += uncompressed as number;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    }
  }
}

async function loadPackage(bytes: Uint8Array): Promise<JSZip> {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 1 ||
    bytes.byteLength > MAX_COMPRESSED_BYTES
  ) throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  try {
    return await JSZip.loadAsync(bytes.slice());
  } catch {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
}

async function boundedXml(entry: ZipEntryMetadata): Promise<string> {
  const size = entry._data?.uncompressedSize;
  if (
    !Number.isSafeInteger(size) || (size as number) < 1 ||
    (size as number) > MAX_XML_BYTES
  ) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  const bytes = await entry.async("uint8array");
  if (bytes.byteLength !== size) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
}

export async function assertStrictXlsxPackage(
  bytes: Uint8Array,
): Promise<void> {
  const zip = await loadPackage(bytes);
  const entries = Object.values(zip.files) as ZipEntryMetadata[];
  assertPackageEnvelope(bytes, entries, zip, validEntryPath);
  const contentTypes = await boundedXml(
    zip.file("[Content_Types].xml") as unknown as ZipEntryMetadata,
  );
  if (
    !contentTypes.includes(XLSX_MAIN) || FORBIDDEN_XML.test(contentTypes)
  ) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  const workbookXml = await boundedXml(
    zip.file("xl/workbook.xml") as unknown as ZipEntryMetadata,
  );
  if (
    /<(?:[A-Za-z0-9_]+:)?(?:definedNames|externalReferences)(?:\s|>)/i.test(
      workbookXml,
    )
  ) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  for (
    const entry of entries.filter((candidate) =>
      /^xl\/worksheets\/sheet[1-9][0-9]*\.xml$/i.test(candidate.name)
    )
  ) {
    const worksheet = await boundedXml(entry);
    if (/<(?:[A-Za-z0-9_]+:)?(?:f|hyperlink)(?:\s|>)/i.test(worksheet)) {
      throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    }
  }
  for (
    const entry of entries.filter((candidate) =>
      candidate.name.endsWith(".rels")
    )
  ) {
    const relationships = await boundedXml(entry);
    if (
      /TargetMode\s*=\s*["']External["']/i.test(relationships) ||
      FORBIDDEN_XML.test(relationships)
    ) {
      throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    }
  }
}

export type MacroSafeSpreadsheet = Readonly<{
  analysisBytes: Uint8Array;
  analysisSha256: string;
  macroSha256: string;
}>;

function stripFormulaMarkup(xml: string): string {
  return xml
    .replace(/<(?:[A-Za-z0-9_]+:)?f\b[^>]*>[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?f\s*>/gi, "")
    .replace(/<(?:[A-Za-z0-9_]+:)?f\b[^>]*\/>/gi, "");
}

export async function createMacroSafeSpreadsheetAnalysis(
  bytes: Uint8Array,
): Promise<MacroSafeSpreadsheet> {
  const zip = await loadPackage(bytes);
  const entries = Object.values(zip.files) as ZipEntryMetadata[];
  assertPackageEnvelope(bytes, entries, zip, validMacroEntryPath);
  const vbaEntry = zip.file(VBA_PATH) as unknown as ZipEntryMetadata | null;
  if (!vbaEntry) throw new Error("XLSM_PACKAGE_POLICY_REJECTED");

  const contentTypesEntry = zip.file("[Content_Types].xml") as unknown as ZipEntryMetadata;
  const workbookRelsEntry = zip.file("xl/_rels/workbook.xml.rels") as unknown as ZipEntryMetadata;
  const contentTypes = await boundedXml(contentTypesEntry);
  const workbookRelationships = await boundedXml(workbookRelsEntry);
  if (
    !contentTypes.includes(XLSM_MAIN) ||
    !contentTypes.includes(VBA_CONTENT_TYPE) ||
    !/Type\s*=\s*["'][^"']*\/vbaProject["']/i.test(workbookRelationships) ||
    FORBIDDEN_XLSM_XML.test(contentTypes) ||
    /TargetMode\s*=\s*["']External["']/i.test(workbookRelationships) ||
    FORBIDDEN_XLSM_XML.test(workbookRelationships)
  ) throw new Error("XLSM_PACKAGE_POLICY_REJECTED");

  const workbookEntry = zip.file("xl/workbook.xml") as unknown as ZipEntryMetadata;
  let workbookXml = await boundedXml(workbookEntry);
  if (/<(?:[A-Za-z0-9_]+:)?externalReferences(?:\s|>)/i.test(workbookXml)) {
    throw new Error("XLSM_PACKAGE_POLICY_REJECTED");
  }
  workbookXml = workbookXml
    .replace(/<(?:[A-Za-z0-9_]+:)?definedNames\b[^>]*>[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?definedNames\s*>/gi, "")
    .replace(/<(?:[A-Za-z0-9_]+:)?definedNames\b[^>]*\/>/gi, "");
  zip.file("xl/workbook.xml", workbookXml);

  for (const entry of entries.filter((candidate) =>
    /^xl\/worksheets\/sheet[1-9][0-9]*\.xml$/i.test(candidate.name)
  )) {
    const worksheet = await boundedXml(entry);
    if (/<(?:[A-Za-z0-9_]+:)?hyperlink(?:\s|>)/i.test(worksheet)) {
      throw new Error("XLSM_PACKAGE_POLICY_REJECTED");
    }
    zip.file(entry.name, stripFormulaMarkup(worksheet));
  }

  for (const entry of entries.filter((candidate) => candidate.name.endsWith(".rels"))) {
    const relationships = await boundedXml(entry);
    if (
      /TargetMode\s*=\s*["']External["']/i.test(relationships) ||
      FORBIDDEN_XLSM_XML.test(relationships)
    ) throw new Error("XLSM_PACKAGE_POLICY_REJECTED");
  }

  const vbaBytes = await vbaEntry.async("uint8array");
  const sanitizedContentTypes = contentTypes
    .replaceAll(XLSM_MAIN, XLSX_MAIN)
    .replace(/<Override\b(?=[^>]*\bPartName=["']\/xl\/vbaProject\.bin["'])[^>]*\/>/gi, "")
    .replace(/<Default\b(?=[^>]*\bExtension=["']bin["'])(?=[^>]*\bContentType=["']application\/vnd\.ms-office\.vbaProject["'])[^>]*\/>/gi, "");
  const sanitizedWorkbookRels = workbookRelationships.replace(
    /<Relationship\b(?=[^>]*(?:\bType=["'][^"']*\/vbaProject["']|\bTarget=["'](?:\.\.\/)?vbaProject\.bin["']))[^>]*\/>/gi,
    "",
  );
  zip.file("[Content_Types].xml", sanitizedContentTypes);
  zip.file("xl/_rels/workbook.xml.rels", sanitizedWorkbookRels);
  zip.remove(VBA_PATH);

  const analysisBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await assertStrictXlsxPackage(analysisBytes);
  return Object.freeze({
    analysisBytes,
    analysisSha256: await sha256Hex(analysisBytes),
    macroSha256: await sha256Hex(vbaBytes),
  });
}

export function createMacroSafeXlsmPackageScanner(expectedSha256?: string) {
  if (expectedSha256 !== undefined && !SHA256.test(expectedSha256)) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return async (bytes: Uint8Array): Promise<"clean" | "unknown"> => {
    if (
      expectedSha256 !== undefined &&
      await sha256Hex(bytes) !== expectedSha256
    ) return "unknown";
    try {
      await createMacroSafeSpreadsheetAnalysis(bytes);
      return "clean";
    } catch {
      return "unknown";
    }
  };
}

export function createStrictXlsxPackageScanner(expectedSha256?: string) {
  if (expectedSha256 !== undefined && !SHA256.test(expectedSha256)) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return async (bytes: Uint8Array): Promise<"clean" | "unknown"> => {
    if (
      expectedSha256 !== undefined &&
      await sha256Hex(bytes) !== expectedSha256
    ) return "unknown";
    try {
      await assertStrictXlsxPackage(bytes);
      return "clean";
    } catch {
      return "unknown";
    }
  };
}
