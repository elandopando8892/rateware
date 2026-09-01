import JSZip from "npm:jszip@3.10.1";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  PDFRawStream,
} from "pdf-lib";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 2_000;
const MAX_XML_BYTES = 4 * 1024 * 1024;
const DOCX_MAIN =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const FORBIDDEN_DOCX_PATH =
  /(?:^|\/)(?:activex|embeddings|customui|_xmlsignatures|webextensions)(?:\/|$)|\.(?:bin|exe|dll|com|bat|cmd|js|vbs|ps1|jar|msi|scr|hta)$/i;

type ZipEntryMetadata = {
  dir: boolean;
  name: string;
  unsafeOriginalName?: string;
  _data?: { uncompressedSize?: number; compressedSize?: number };
  async(type: "uint8array" | "string"): Promise<Uint8Array | string>;
};

function reject(
  code: "PDF_PACKAGE_POLICY_REJECTED" | "DOCX_PACKAGE_POLICY_REJECTED",
): never {
  throw new Error(code);
}

const FORBIDDEN_PDF_KEYS = new Set([
  "/AA",
  "/EF",
  "/EmbeddedFile",
  "/EmbeddedFiles",
  "/JS",
  "/JavaScript",
  "/Launch",
  "/OpenAction",
]);
const FORBIDDEN_PDF_ACTIONS = new Set(["/JavaScript", "/Launch"]);

function hasForbiddenPdfObject(
  object: PDFObject,
  visited: Set<PDFObject>,
): boolean {
  if (visited.has(object)) return false;
  visited.add(object);
  if (object instanceof PDFRawStream) {
    return hasForbiddenPdfObject(object.dict, visited);
  }
  if (object instanceof PDFArray) {
    for (let index = 0; index < object.size(); index += 1) {
      const child = object.lookup(index);
      if (child && hasForbiddenPdfObject(child, visited)) return true;
    }
    return false;
  }
  if (!(object instanceof PDFDict)) return false;
  for (const key of object.keys()) {
    const name = key.toString();
    if (FORBIDDEN_PDF_KEYS.has(name)) return true;
    const child = object.lookup(key);
    if (
      name === "/S" && child instanceof PDFName &&
      FORBIDDEN_PDF_ACTIONS.has(child.toString())
    ) return true;
    if (child && hasForbiddenPdfObject(child, visited)) return true;
  }
  return false;
}

export async function assertStrictPdfPackage(bytes: Uint8Array): Promise<void> {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 8 ||
    bytes.byteLength > MAX_BYTES
  ) {
    reject("PDF_PACKAGE_POLICY_REJECTED");
  }
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  if (!header.startsWith("%PDF-")) reject("PDF_PACKAGE_POLICY_REJECTED");
  try {
    const document = await PDFDocument.load(bytes.slice(), {
      ignoreEncryption: false,
    });
    const objects = document.context.enumerateIndirectObjects();
    if (
      document.getPageCount() < 1 || document.isEncrypted ||
      objects.some(([, object]) =>
        hasForbiddenPdfObject(object, new Set<PDFObject>())
      )
    ) {
      reject("PDF_PACKAGE_POLICY_REJECTED");
    }
  } catch {
    reject("PDF_PACKAGE_POLICY_REJECTED");
  }
}

export async function assertStrictDocxPackage(
  bytes: Uint8Array,
): Promise<void> {
  if (
    !(bytes instanceof Uint8Array) || bytes.byteLength < 1 ||
    bytes.byteLength > MAX_BYTES
  ) {
    reject("DOCX_PACKAGE_POLICY_REJECTED");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes.slice());
  } catch {
    reject("DOCX_PACKAGE_POLICY_REJECTED");
  }
  const entries = Object.values(zip.files) as ZipEntryMetadata[];
  if (
    entries.length < 4 || entries.length > MAX_ENTRIES ||
    !zip.file("[Content_Types].xml") || !zip.file("_rels/.rels") ||
    !zip.file("word/document.xml")
  ) reject("DOCX_PACKAGE_POLICY_REJECTED");
  let totalUncompressed = 0;
  for (const entry of entries) {
    const original = entry.unsafeOriginalName ?? entry.name;
    const uncompressed = entry._data?.uncompressedSize;
    const compressed = entry._data?.compressedSize;
    if (
      original !== entry.name || entry.name.length < 1 ||
      entry.name.length > 512 ||
      entry.name.startsWith("/") || entry.name.includes("\\") ||
      entry.name.split("/").includes("..") ||
      FORBIDDEN_DOCX_PATH.test(entry.name) ||
      (!entry.dir &&
        (!Number.isSafeInteger(uncompressed) ||
          !Number.isSafeInteger(compressed) ||
          Number(uncompressed) < 0 || Number(compressed) < 0 ||
          Number(uncompressed) > MAX_ENTRY_BYTES))
    ) reject("DOCX_PACKAGE_POLICY_REJECTED");
    if (!entry.dir) totalUncompressed += Number(uncompressed);
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      reject("DOCX_PACKAGE_POLICY_REJECTED");
    }
  }
  for (const entry of entries.filter(({ name }) => name.endsWith(".rels"))) {
    if (Number(entry._data?.uncompressedSize) > MAX_XML_BYTES) {
      reject("DOCX_PACKAGE_POLICY_REJECTED");
    }
    const relationships = await entry.async("string") as string;
    if (/TargetMode\s*=\s*["']External["']/i.test(relationships)) {
      reject("DOCX_PACKAGE_POLICY_REJECTED");
    }
  }
  const contentTypesEntry = zip.file(
    "[Content_Types].xml",
  ) as unknown as ZipEntryMetadata;
  if (Number(contentTypesEntry._data?.uncompressedSize) > MAX_XML_BYTES) {
    reject("DOCX_PACKAGE_POLICY_REJECTED");
  }
  const contentTypes = await contentTypesEntry.async("string") as string;
  if (
    !contentTypes.includes(DOCX_MAIN) ||
    /macroenabled|vbaproject|activex|oleobject/i.test(contentTypes)
  ) {
    reject("DOCX_PACKAGE_POLICY_REJECTED");
  }
}

export function createStrictDocumentPackageScanner(contentType: string) {
  return async (bytes: Uint8Array): Promise<"clean" | "unknown"> => {
    try {
      if (contentType === "application/pdf") {
        await assertStrictPdfPackage(bytes);
      } else if (
        contentType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        await assertStrictDocxPackage(bytes);
      } else return "unknown";
      return "clean";
    } catch {
      return "unknown";
    }
  };
}
