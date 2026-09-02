import ExcelJS from "exceljs";
import JSZip from "npm:jszip@3.10.1";

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
      targets.has(target(mapping))
    ) {
      throw new Error("ARTIFACT_MAPPING_INVALID");
    }
    targets.add(target(mapping));
  }
  return sorted;
}

function isExecutableCellValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.formula === "string" ||
    typeof record.hyperlink === "string";
}

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12" as const;

type FormCoverage = NonNullable<
  Awaited<ReturnType<typeof artifactReceipt>>["formCoverage"]
>;

function excelCoverage(workbook: ExcelJS.Workbook): FormCoverage {
  const writable: string[] = [];
  const complete: string[] = [];
  for (
    const worksheet of workbook.worksheets.filter((sheet) =>
      sheet.state === "visible"
    )
  ) {
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.protection?.locked !== false) return;
        const id = `${worksheet.name}!${cell.address}`;
        writable.push(id);
        if (
          cell.value !== null && cell.value !== undefined &&
          String(cell.value).trim() !== ""
        ) complete.push(id);
      });
    });
  }
  const percentage = writable.length === 0
    ? 0
    : complete.length / writable.length * 100;
  return Object.freeze({
    visiblePageCount: workbook.worksheets.filter((sheet) =>
      sheet.state === "visible"
    ).length,
    writableFieldCount: writable.length,
    completedWritableFieldCount: complete.length,
    completionPercent: Number(percentage.toFixed(2)),
    blankWritableTargets: Object.freeze(
      writable.filter((item) => !complete.includes(item)).slice(0, 200),
    ),
    macroPreserved: false,
    printerSettingsPreserved: false,
  });
}

function xmlDecode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(
    /&lt;/g,
    "<",
  ).replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  );
}

function styleIndexes(styles: string): ReadonlySet<number> {
  const section = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1];
  if (!section) throw new Error("ARTIFACT_SOURCE_INVALID");
  const unlocked = new Set<number>();
  const records = section.match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) ??
    [];
  records.forEach((record, index) => {
    if (/<protection\b[^>]*\slocked="0"/.test(record)) unlocked.add(index);
  });
  return unlocked;
}

function column(value: string): number {
  return [...value].reduce(
    (total, character) => total * 26 + character.charCodeAt(0) - 64,
    0,
  );
}

function within(cell: string, range: string): boolean {
  const pair = range.split(":");
  if (pair.length !== 2) return false;
  const current = CELL.exec(cell);
  const start = CELL.exec(pair[0]);
  const end = CELL.exec(pair[1]);
  if (!current || !start || !end) return false;
  return Number(current[2]) >= Number(start[2]) &&
    Number(current[2]) <= Number(end[2]) &&
    column(current[1]) >= column(start[1]) &&
    column(current[1]) <= column(end[1]);
}

function macroCellValue(
  value: string | number | boolean,
): Readonly<{ type: string; content: string }> {
  if (typeof value === "string") {
    return {
      type: ' t="inlineStr"',
      content: `<is><t xml:space="preserve">${xmlEscape(value)}</t></is>`,
    };
  }
  if (typeof value === "boolean") {
    return { type: ' t="b"', content: `<v>${value ? 1 : 0}</v>` };
  }
  return { type: "", content: `<v>${value}</v>` };
}

function patchCellXml(xml: string, mapping: XlsxArtifactMapping): string {
  for (
    const merged of xml.matchAll(
      /<mergeCell\b[^>]*\bref="([A-Z]{1,3}[1-9][0-9]*:[A-Z]{1,3}[1-9][0-9]*)"/g,
    )
  ) {
    if (
      within(mapping.cell, merged[1]) &&
      mapping.cell !== merged[1].split(":")[0]
    ) throw new Error("ARTIFACT_MAPPING_INVALID");
  }
  if (new RegExp(`<hyperlink\\b[^>]*\\bref="${mapping.cell}"`).test(xml)) {
    throw new Error("ARTIFACT_MAPPING_INVALID");
  }
  const matcher = new RegExp(
    `<c\\b([^>]*\\br="${mapping.cell}"[^>]*)>([\\s\\S]*?)<\\/c>|<c\\b([^>]*\\br="${mapping.cell}"[^>]*)\\/>`,
  );
  const match = matcher.exec(xml);
  if (!match || /<f\b/.test(match[2] ?? "")) {
    throw new Error("ARTIFACT_MAPPING_INVALID");
  }
  const attributes = (match[1] ?? match[3]).replace(/\s+t="[^"]*"/g, "");
  const safe = macroCellValue(mapping.value);
  return `${
    xml.slice(0, match.index)
  }<c${attributes}${safe.type}>${safe.content}</c>${
    xml.slice(match.index + match[0].length)
  }`;
}

function macroCoverage(
  input: Readonly<{
    sheets: readonly { name: string; visible: boolean; xml: string }[];
    unlockedStyles: ReadonlySet<number>;
    macroPreserved: boolean;
    printerSettingsPreserved: boolean;
  }>,
): FormCoverage {
  const writable: string[] = [];
  const completed: string[] = [];
  for (const sheet of input.sheets.filter((item) => item.visible)) {
    for (
      const match of sheet.xml.matchAll(
        /<c\b([^>]*\br="([A-Z]{1,3}[1-9][0-9]*)"[^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )
    ) {
      const style = /\bs="(\d+)"/.exec(match[1]);
      if (!style || !input.unlockedStyles.has(Number(style[1]))) continue;
      const id = `${sheet.name}!${match[2]}`;
      writable.push(id);
      const content = match[3] ?? "";
      if (
        /<v>[^<]*\S[^<]*<\/v>|<t(?:\s[^>]*)?>[\s\S]*?\S[\s\S]*?<\/t>/.test(
          content,
        )
      ) completed.push(id);
    }
  }
  const percentage = writable.length === 0
    ? 0
    : completed.length / writable.length * 100;
  return Object.freeze({
    visiblePageCount: input.sheets.filter((sheet) => sheet.visible).length,
    writableFieldCount: writable.length,
    completedWritableFieldCount: completed.length,
    completionPercent: Number(percentage.toFixed(2)),
    blankWritableTargets: Object.freeze(
      writable.filter((item) => !completed.includes(item)).slice(0, 200),
    ),
    macroPreserved: input.macroPreserved,
    printerSettingsPreserved: input.printerSettingsPreserved,
  });
}

async function completeMacroEnabledArtifact(
  input: SupplierArtifactContext & { mappings: readonly XlsxArtifactMapping[] },
  mappings: readonly XlsxArtifactMapping[],
  applied: AppliedArtifactMapping[],
) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input.sourceBytes.slice());
  } catch {
    throw new Error("ARTIFACT_SOURCE_INVALID");
  }
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  const stylesXml = await zip.file("xl/styles.xml")?.async("text");
  if (
    !workbookXml || !relsXml || !stylesXml || !zip.file("xl/vbaProject.bin") ||
    workbookXml.length > 1_000_000 || relsXml.length > 1_000_000 ||
    stylesXml.length > 10_000_000
  ) throw new Error("ARTIFACT_SOURCE_INVALID");
  const targets = new Map<string, string>();
  for (
    const relation of relsXml.matchAll(
      /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g,
    )
  ) {
    const target = relation[2].replace(/^\/?xl\//, "");
    if (/^worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(target)) {
      targets.set(relation[1], `xl/${target}`);
    }
  }
  const sheets: {
    name: string;
    visible: boolean;
    path: string;
    xml: string;
  }[] = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = /\bname="([^"]+)"/.exec(sheet[1]);
    const relationship = /\br:id="([^"]+)"/.exec(sheet[1]);
    if (!name || !relationship || !targets.get(relationship[1])) {
      throw new Error("ARTIFACT_SOURCE_INVALID");
    }
    const path = targets.get(relationship[1])!;
    const xml = await zip.file(path)?.async("text");
    if (!xml || xml.length > 25_000_000) {
      throw new Error("ARTIFACT_SOURCE_INVALID");
    }
    sheets.push({
      name: xmlDecode(name[1]),
      visible: !/\bstate="(?:hidden|veryHidden)"/.test(sheet[1]),
      path,
      xml,
    });
  }
  for (const mapping of mappings) {
    const sheet = sheets.find((candidate) => candidate.name === mapping.sheet);
    if (!sheet) throw new Error("ARTIFACT_MAPPING_INVALID");
    sheet.xml = patchCellXml(sheet.xml, mapping);
    applied.push({
      kind: "xlsx_cell",
      mappingDecisionId: mapping.mappingDecisionId,
      canonicalFieldId: mapping.canonicalFieldId,
      target: target(mapping),
    });
  }
  for (const sheet of sheets) zip.file(sheet.path, sheet.xml);
  let bytes: Uint8Array;
  try {
    bytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  if (bytes.byteLength < 1 || bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  const receipt = await artifactReceipt(
    input,
    XLSM,
    bytes,
    applied,
    macroCoverage({
      sheets,
      unlockedStyles: styleIndexes(stylesXml),
      macroPreserved: Boolean(zip.file("xl/vbaProject.bin")),
      printerSettingsPreserved: Object.keys(zip.files).some((name) =>
        name.startsWith("xl/printerSettings/") && !zip.files[name].dir
      ),
    }),
  );
  return Object.freeze({ bytes, receipt });
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
  const applied: AppliedArtifactMapping[] = [];
  if (input.sourceContentType === XLSM) {
    return await completeMacroEnabledArtifact(input, mappings, applied);
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input.sourceBytes.slice() as never);
  } catch {
    throw new Error("ARTIFACT_SOURCE_INVALID");
  }
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
      XLSX,
      bytes,
      applied,
      excelCoverage(workbook),
    ),
  });
}
