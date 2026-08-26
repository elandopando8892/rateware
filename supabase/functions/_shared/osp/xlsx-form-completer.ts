import ExcelJS from "exceljs";

import {
  type AppliedArtifactMapping,
  artifactReceipt,
  type SupplierArtifactContext,
  validateArtifactContext,
  validateArtifactValue,
  validateMappingIdentity,
  validateReviewedMappingSet,
} from "./supplier-artifact-port.ts";

export type XlsxArtifactMapping = {
  mappingDecisionId: string;
  canonicalFieldId: string;
  sheet: string;
  cell: string;
  value: string | number | boolean;
};

const CELL = /^([A-Z]{1,3})([1-9][0-9]*)$/;

function cellCoordinates(value: string): readonly [number, number] | null {
  const match = CELL.exec(value);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  const row = Number(match[2]);
  return column <= 16_384 && row <= 1_048_576 ? [column, row] : null;
}

function target(mapping: XlsxArtifactMapping): string {
  return `${mapping.sheet}!${mapping.cell}`;
}

function validateMappings(
  mappings: readonly XlsxArtifactMapping[],
): XlsxArtifactMapping[] {
  if (
    !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 10_000
  ) throw new Error("ARTIFACT_MAPPING_INVALID");
  const sorted = [...mappings].sort((left, right) =>
    target(left).localeCompare(target(right), "en", { numeric: true })
  );
  const targets = new Set<string>();
  const decisions = new Set<string>();
  for (const mapping of sorted) {
    validateMappingIdentity(
      mapping.mappingDecisionId,
      mapping.canonicalFieldId,
    );
    validateArtifactValue(mapping.value);
    if (
      typeof mapping.sheet !== "string" ||
      mapping.sheet.trim() !== mapping.sheet || mapping.sheet.length < 1 ||
      mapping.sheet.length > 128 ||
      typeof mapping.cell !== "string" || !cellCoordinates(mapping.cell) ||
      targets.has(target(mapping)) || decisions.has(mapping.mappingDecisionId)
    ) {
      throw new Error("ARTIFACT_MAPPING_INVALID");
    }
    targets.add(target(mapping));
    decisions.add(mapping.mappingDecisionId);
  }
  return sorted;
}

function isExecutableCellValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.formula === "string" ||
    typeof record.hyperlink === "string";
}

export async function completeXlsxArtifact(
  input: SupplierArtifactContext & { mappings: readonly XlsxArtifactMapping[] },
) {
  await validateArtifactContext(input);
  const mappings = validateMappings(input.mappings);
  validateReviewedMappingSet(
    input,
    mappings.map((mapping) => mapping.mappingDecisionId),
  );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input.sourceBytes.slice() as never);
  } catch {
    throw new Error("ARTIFACT_SOURCE_INVALID");
  }
  const applied: AppliedArtifactMapping[] = [];
  for (const mapping of mappings) {
    const worksheet = workbook.getWorksheet(mapping.sheet);
    if (!worksheet) throw new Error("ARTIFACT_MAPPING_INVALID");
    const cell = worksheet.getCell(mapping.cell);
    if (
      cell.isMerged && cell.master.address !== cell.address ||
      isExecutableCellValue(cell.value)
    ) throw new Error("ARTIFACT_MAPPING_INVALID");
    cell.value = mapping.value;
    applied.push({
      kind: "xlsx_cell",
      mappingDecisionId: mapping.mappingDecisionId,
      canonicalFieldId: mapping.canonicalFieldId,
      target: target(mapping),
    });
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  } catch {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  if (bytes.byteLength < 1 || bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  return Object.freeze({
    bytes,
    receipt: await artifactReceipt(
      input,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
      applied,
    ),
  });
}
