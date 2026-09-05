import { FormComponentSchema } from "../../../apps/osp/src/api/contracts.ts";
import { assessFormCompletion } from "../../../apps/osp/src/features/forms/form-completion.ts";
import {
  validateArtifactValue,
  validateMappingIdentity,
} from "../_shared/osp/supplier-artifact-port.ts";
import type { XlsxArtifactMapping } from "../_shared/osp/xlsx-form-completer.ts";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ARTIFACT_MAPPING_INVALID");
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: string[]): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) throw new Error("ARTIFACT_MAPPING_INVALID");
}

/** Consumes only targets and values bound to the immutable reviewed snapshot by SQL. */
export function resolveReviewedSpreadsheetTargets(
  rows: unknown,
  requiredTableFields: readonly string[] = [],
): XlsxArtifactMapping[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10_000) {
    throw new Error("ARTIFACT_MAPPING_INVALID");
  }
  const tables = new Map<
    string,
    { required: Set<string>; mapped: Set<string> }
  >();
  const destinations = new Set<string>();
  const result = rows.map((raw) => {
    const row = record(raw);
    const target = record(row.reviewedTarget);
    const parsed = FormComponentSchema.safeParse({
      ...record(row.definition),
      id: row.fieldKey,
      visibility: null,
    });
    if (!parsed.success) throw new Error("ARTIFACT_MAPPING_INVALID");
    const field = parsed.data;
    let value: unknown = row.value;
    let canonicalFieldId: string;
    if (field.definition.kind === "repeating_table") {
      exact(target, ["fieldKey", "rowIndex", "columnId", "sheet", "cell"]);
      if (
        target.fieldKey !== field.id ||
        !Number.isSafeInteger(target.rowIndex) || Number(target.rowIndex) < 0 ||
        typeof target.columnId !== "string" ||
        !field.definition.columns.some((column) =>
          column.id === target.columnId
        ) ||
        !Array.isArray(value) || Number(target.rowIndex) >= value.length
      ) throw new Error("ARTIFACT_MAPPING_INVALID");
      if (
        assessFormCompletion({ fields: [field] }, { [field.id]: value }).issues
          .length
      ) throw new Error("ARTIFACT_TABLE_INCOMPLETE");
      let coverage = tables.get(field.id);
      if (!coverage) {
        coverage = { required: new Set(), mapped: new Set() };
        value.forEach((entry, index) => {
          const data = record(entry);
          for (
            const column of field.definition.kind === "repeating_table"
              ? field.definition.columns
              : []
          ) {
            const item = data[column.id];
            if (
              column.required ||
              item !== undefined && item !== null && String(item).trim() !== ""
            ) coverage!.required.add(`${index}:${column.id}`);
          }
        });
        tables.set(field.id, coverage);
      }
      coverage.mapped.add(`${target.rowIndex}:${target.columnId}`);
      value = record(value[Number(target.rowIndex)])[target.columnId];
      canonicalFieldId = `${field.id}.row${
        Number(target.rowIndex) + 1
      }.${target.columnId}`;
    } else {
      exact(target, ["canonicalFieldId", "sheet", "cell"]);
      if (
        target.canonicalFieldId !== field.canonicalFieldId ||
        typeof target.canonicalFieldId !== "string"
      ) throw new Error("ARTIFACT_MAPPING_INVALID");
      if (
        assessFormCompletion({ fields: [field] }, { [field.id]: value }).issues
          .length
      ) throw new Error("ARTIFACT_MAPPING_INVALID");
      canonicalFieldId = target.canonicalFieldId;
    }
    validateMappingIdentity(row.mappingDecisionId, canonicalFieldId);
    validateArtifactValue(value);
    if (typeof value === "string" && value.trim() === "") {
      throw new Error("ARTIFACT_MAPPING_INVALID");
    }
    if (
      typeof target.sheet !== "string" || !target.sheet ||
      target.sheet.length > 128 || target.sheet.trim() !== target.sheet ||
      target.sheet.includes("!") ||
      typeof target.cell !== "string" ||
      !/^[A-Z]{1,3}[1-9][0-9]*$/.test(target.cell)
    ) throw new Error("ARTIFACT_MAPPING_INVALID");
    const address = `${target.sheet}!${target.cell}`;
    if (destinations.has(address)) throw new Error("ARTIFACT_MAPPING_INVALID");
    destinations.add(address);
    return {
      mappingDecisionId: String(row.mappingDecisionId),
      canonicalFieldId,
      sheet: target.sheet,
      cell: target.cell,
      value,
    };
  });
  if (
    requiredTableFields.some((key) => !tables.has(key)) ||
    [...tables.values()].some((table) =>
      [...table.required].some((key) => !table.mapped.has(key))
    )
  ) throw new Error("ARTIFACT_TABLE_TARGETS_INCOMPLETE");
  return result;
}
