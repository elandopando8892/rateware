import { PDFDocument, PDFTextField, StandardFonts } from "pdf-lib";

import {
  type AppliedArtifactMapping,
  artifactReceipt,
  type SupplierArtifactContext,
  validateArtifactContext,
  validateArtifactValue,
  validateMappingIdentity,
  validateReviewedMappingSet,
} from "./supplier-artifact-port.ts";

type AcroFormMapping = {
  kind: "acroform";
  mappingDecisionId: string;
  canonicalFieldId: string;
  fieldName: string;
  value: string | number | boolean;
};
type OverlayMapping = {
  kind: "overlay";
  mappingDecisionId: string;
  canonicalFieldId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  value: string | number | boolean;
};
type AppendixMapping = {
  kind: "appendix";
  mappingDecisionId: string;
  canonicalFieldId: string;
  value: string | number | boolean;
};
export type PdfArtifactMapping =
  | AcroFormMapping
  | OverlayMapping
  | AppendixMapping;

/** Preserve all characters; inserted line breaks never replace or truncate data. */
export function wrapPdfText(
  text: string,
  width: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let remaining = [...paragraph];
    if (!remaining.length) lines.push("");
    while (remaining.length) {
      let length = 0, measured = 0;
      while (length < remaining.length) {
        const next = measure(remaining[length]);
        if (measured + next > width) break;
        measured += next;
        length++;
      }
      if (!length) throw new Error("ARTIFACT_MAPPING_INVALID");
      if (length < remaining.length) {
        const lastSpace = remaining.slice(0, length).lastIndexOf(" ");
        if (lastSpace >= 0) length = lastSpace + 1;
      }
      lines.push(remaining.slice(0, length).join(""));
      remaining = remaining.slice(length);
    }
  }
  return lines;
}

function target(mapping: PdfArtifactMapping): string {
  return mapping.kind === "acroform"
    ? mapping.fieldName
    : mapping.kind === "appendix"
    ? `appendix:${mapping.canonicalFieldId}`
    : `page:${mapping.page}:${mapping.x}:${mapping.y}:${mapping.width}:${mapping.height}:${mapping.fontSize}`;
}

function validateMappings(
  mappings: readonly PdfArtifactMapping[],
): PdfArtifactMapping[] {
  if (
    !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 500
  ) throw new Error("ARTIFACT_MAPPING_INVALID");
  const sorted = [...mappings].sort((left, right) =>
    target(left).localeCompare(target(right))
  );
  const targets = new Set<string>();
  for (const mapping of sorted) {
    validateMappingIdentity(
      mapping.mappingDecisionId,
      mapping.canonicalFieldId,
    );
    validateArtifactValue(mapping.value);
    const mappingTarget = target(mapping);
    if (targets.has(mappingTarget)) throw new Error("ARTIFACT_MAPPING_INVALID");
    targets.add(mappingTarget);
    if (mapping.kind === "acroform") {
      if (
        typeof mapping.fieldName !== "string" ||
        mapping.fieldName.trim() !== mapping.fieldName ||
        mapping.fieldName.length < 1 || mapping.fieldName.length > 256
      ) throw new Error("ARTIFACT_MAPPING_INVALID");
      continue;
    }
    if (mapping.kind === "appendix") continue;
    if (
      !Number.isSafeInteger(mapping.page) || mapping.page < 1 ||
      [mapping.x, mapping.y].some((value) =>
        typeof value !== "number" || !Number.isFinite(value) || value < 0
      ) ||
      [mapping.width, mapping.height, mapping.fontSize].some((value) =>
        typeof value !== "number" || !Number.isFinite(value) || value <= 0
      ) ||
      mapping.fontSize > mapping.height || typeof mapping.value !== "string" ||
      mapping.value.includes("\n")
    ) {
      throw new Error("ARTIFACT_MAPPING_INVALID");
    }
  }
  return sorted;
}

export async function completePdfArtifact(
  input: SupplierArtifactContext & {
    flatten: boolean;
    mappings: readonly PdfArtifactMapping[];
  },
) {
  await validateArtifactContext(input);
  if (typeof input.flatten !== "boolean") {
    throw new Error("ARTIFACT_INPUT_INVALID");
  }
  const mappings = validateMappings(input.mappings);
  validateReviewedMappingSet(
    input,
    mappings.map((mapping) => mapping.mappingDecisionId),
  );
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(input.sourceBytes.slice(), {
      ignoreEncryption: false,
    });
  } catch {
    throw new Error("ARTIFACT_SOURCE_INVALID");
  }
  const canonicalMetadataDate = new Date("2000-01-01T00:00:00.000Z");
  document.setCreationDate(canonicalMetadataDate);
  document.setModificationDate(canonicalMetadataDate);
  const form = document.getForm();
  let overlayFont: Awaited<ReturnType<PDFDocument["embedFont"]>> | undefined;
  const applied: AppliedArtifactMapping[] = [];
  let appendixPage: ReturnType<PDFDocument["addPage"]> | undefined;
  let appendixLine = 0;
  let appendixPageCount = 0;
  for (const mapping of mappings) {
    if (mapping.kind === "acroform") {
      let field;
      try {
        field = form.getField(mapping.fieldName);
      } catch {
        throw new Error("ARTIFACT_MAPPING_INVALID");
      }
      if (!(field instanceof PDFTextField)) {
        throw new Error("ARTIFACT_MAPPING_INVALID");
      }
      field.setText(String(mapping.value));
      applied.push({
        kind: "acroform",
        mappingDecisionId: mapping.mappingDecisionId,
        canonicalFieldId: mapping.canonicalFieldId,
        target: mapping.fieldName,
      });
      continue;
    }
    if (mapping.kind === "appendix") {
      overlayFont ??= await document.embedFont(StandardFonts.Helvetica);
      let lines: string[];
      try {
        lines = wrapPdfText(
          `${mapping.canonicalFieldId}: ${String(mapping.value)}`,
          504,
          (value) => overlayFont!.widthOfTextAtSize(value, 9),
        );
      } catch {
        throw new Error("ARTIFACT_MAPPING_INVALID");
      }
      for (const line of lines) {
        if (!appendixPage || appendixLine >= 36) {
          if (++appendixPageCount > 100) {
            throw new Error("ARTIFACT_OUTPUT_INVALID");
          }
          appendixPage = document.addPage([612, 792]);
          appendixLine = 0;
          appendixPage.drawText("XBF completed response", {
            x: 54,
            y: 742,
            size: 14,
            font: overlayFont,
          });
        }
        appendixPage.drawText(line, {
          x: 54,
          y: 714 - appendixLine * 18,
          size: 9,
          font: overlayFont,
        });
        appendixLine++;
      }
      applied.push({
        kind: "pdf_appendix",
        mappingDecisionId: mapping.mappingDecisionId,
        canonicalFieldId: mapping.canonicalFieldId,
        target: target(mapping),
      });
      continue;
    }
    const page = document.getPages()[mapping.page - 1];
    if (
      !page || mapping.x + mapping.width > page.getWidth() ||
      mapping.y + mapping.height > page.getHeight()
    ) throw new Error("ARTIFACT_MAPPING_INVALID");
    overlayFont ??= await document.embedFont(StandardFonts.Helvetica);
    try {
      if (
        overlayFont.widthOfTextAtSize(String(mapping.value), mapping.fontSize) >
          mapping.width
      ) {
        throw new Error("ARTIFACT_MAPPING_INVALID");
      }
      page.drawText(String(mapping.value), {
        x: mapping.x,
        y: mapping.y,
        size: mapping.fontSize,
        font: overlayFont,
      });
    } catch {
      throw new Error("ARTIFACT_MAPPING_INVALID");
    }
    applied.push({
      kind: "pdf_overlay",
      mappingDecisionId: mapping.mappingDecisionId,
      canonicalFieldId: mapping.canonicalFieldId,
      target: target(mapping),
    });
  }
  if (input.flatten) {
    try {
      form.flatten();
    } catch {
      throw new Error("ARTIFACT_MAPPING_INVALID");
    }
  }
  let bytes: Uint8Array;
  try {
    bytes = await document.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateFieldAppearances: true,
    });
  } catch {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  if (bytes.byteLength < 1 || bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  const receipt = await artifactReceipt(
    input,
    "application/pdf",
    bytes,
    applied,
  );
  // Read the serialized output rather than inferring pages from worksheets or mappings.
  const reopened = await PDFDocument.load(bytes, { ignoreEncryption: false });
  return Object.freeze({
    bytes,
    receipt: Object.freeze({
      ...receipt,
      pdfStructure: Object.freeze({
        schemaVersion: 1 as const,
        outputSha256: receipt.outputSha256,
        pageCount: reopened.getPageCount(),
      }),
    }),
  });
}
