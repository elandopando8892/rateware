import JSZip from "npm:jszip@3.10.1";

import { sha256Hex } from "../_shared/osp/source-hash.ts";

const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_XML_BYTES = 1024 * 1024;
const MAX_ENTRIES = 2_000;
const SHA256 = /^[0-9a-f]{64}$/;
const FORBIDDEN_PATH =
  /(?:^|\/)(?:activex|embeddings|externallinks|macrosheets|dialogsheets|customui|_xmlsignatures|querytables|webextensions|pivotcache)(?:\/|$)|(?:^|\/)connections\.xml$|\.(?:bin|exe|dll|com|bat|cmd|js|vbs|ps1|jar|msi|scr|hta)$/i;
const FORBIDDEN_XML =
  /macroenabled|vbaproject|activex|oleobject|externallink|attachedtemplate/i;

type ZipEntryMetadata = {
  dir: boolean;
  name: string;
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number; compressedSize?: number };
  async(type: "string"): Promise<string>;
};

function validEntryPath(entry: ZipEntryMetadata): boolean {
  const original = entry.unsafeOriginalName ?? entry.name;
  return entry.name === original &&
    entry.name.length >= 1 && entry.name.length <= 512 &&
    !entry.name.startsWith("/") && !entry.name.includes("\\") &&
    !entry.name.split("/").includes("..") &&
    !FORBIDDEN_PATH.test(entry.name);
}

async function boundedXml(entry: ZipEntryMetadata): Promise<string> {
  const size = entry._data?.uncompressedSize;
  if (
    !Number.isSafeInteger(size) || (size as number) < 1 ||
    (size as number) > MAX_XML_BYTES
  ) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  const value = await entry.async("string");
  if (new TextEncoder().encode(value).byteLength !== size) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  return value;
}

export async function assertStrictXlsxPackage(
  bytes: Uint8Array,
): Promise<void> {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 1 ||
    bytes.byteLength > MAX_COMPRESSED_BYTES
  ) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes.slice());
  } catch {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  const entries = Object.values(zip.files) as ZipEntryMetadata[];
  if (
    entries.length < 4 || entries.length > MAX_ENTRIES ||
    !zip.file("[Content_Types].xml") || !zip.file("_rels/.rels") ||
    !zip.file("xl/workbook.xml") || !zip.file("xl/_rels/workbook.xml.rels") ||
    !entries.some((entry) =>
      /^xl\/worksheets\/sheet[1-9][0-9]*\.xml$/i.test(entry.name)
    )
  ) {
    throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    if (!validEntryPath(entry)) throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    if (entry.dir) continue;
    const uncompressed = entry._data?.uncompressedSize;
    const compressed = entry._data?.compressedSize;
    if (
      !Number.isSafeInteger(uncompressed) ||
      !Number.isSafeInteger(compressed) ||
      (uncompressed as number) < 0 || (compressed as number) < 0 ||
      (uncompressed as number) > MAX_ENTRY_BYTES
    ) {
      throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    }
    totalUncompressed += uncompressed as number;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("XLSX_PACKAGE_POLICY_REJECTED");
    }
  }
  const contentTypes = await boundedXml(
    zip.file("[Content_Types].xml") as unknown as ZipEntryMetadata,
  );
  if (
    !contentTypes.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    ) || FORBIDDEN_XML.test(contentTypes)
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
