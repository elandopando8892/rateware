import ExcelJS from 'exceljs';

import type { EvidenceItem, EvidenceLocator } from '../_shared/osp/extraction-contracts.ts';
import { createMacroSafeSpreadsheetAnalysis } from './strict-xlsx-package-scanner.ts';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_SHEETS = 50;
const MAX_CELLS = 50_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSM_CONTENT_TYPE = 'application/vnd.ms-excel.sheet.macroEnabled.12';

type CellKind = 'string' | 'number' | 'boolean' | 'date' | 'formula';
export type ParsedCell = { address: string; kind: CellKind; value: string | number | boolean };
export type ParsedSheet = { name: string; mergedRanges: string[]; cells: ParsedCell[] };
export type XlsxEvidence = EvidenceItem & { locator: Extract<EvidenceLocator, { kind: 'xlsx_cell' }> };
export type SpreadsheetProtection = Readonly<{
  macroEnabled: boolean;
  macroExecution: 'blocked';
  analysisMode: 'original' | 'sanitized_copy';
  analysisSha256: string | null;
  macroSha256: string | null;
}>;
export type XlsxStructure = { modelVersion: 'exceljs@4.4.0'; sheets: ParsedSheet[]; evidence: XlsxEvidence[]; protection: SpreadsheetProtection };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cellValue(value: unknown): { kind: CellKind; value: string | number | boolean; evidence: string } | null {
  if (typeof value === 'string') return { kind: 'string', value, evidence: value };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value, evidence: String(value) };
  if (typeof value === 'boolean') return { kind: 'boolean', value, evidence: String(value) };
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { kind: 'date', value: value.toISOString(), evidence: value.toISOString() };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (typeof object.formula === 'string' && object.formula.trim() === object.formula && object.formula.length > 0 && object.formula.length <= 10_000) {
    return { kind: 'formula', value: object.formula, evidence: `FORMULA:${object.formula}` };
  }
  if (Array.isArray(object.richText)) {
    const text = object.richText.map((part) => typeof part === 'object' && part !== null && typeof (part as Record<string, unknown>).text === 'string' ? (part as Record<string, unknown>).text : '').join('');
    return text ? { kind: 'string', value: text, evidence: text } : null;
  }
  if (typeof object.text === 'string') return { kind: 'string', value: object.text, evidence: object.text };
  return null;
}

export async function parseXlsxStructure(input: { sourceVersionId: string; bytes: Uint8Array; contentType?: typeof XLSX_CONTENT_TYPE | typeof XLSM_CONTENT_TYPE }): Promise<XlsxStructure> {
  if (!UUID_PATTERN.test(input.sourceVersionId)) throw new Error('SOURCE_VERSION_ID_INVALID');
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('DOCUMENT_SIZE_INVALID');
  const contentType = input.contentType ?? XLSX_CONTENT_TYPE;
  if (![XLSX_CONTENT_TYPE, XLSM_CONTENT_TYPE].includes(contentType)) throw new Error('SPREADSHEET_CONTENT_TYPE_INVALID');
  let analysisBytes = input.bytes;
  let protection: SpreadsheetProtection = Object.freeze({
    macroEnabled: false,
    macroExecution: 'blocked',
    analysisMode: 'original',
    analysisSha256: null,
    macroSha256: null,
  });
  if (contentType === XLSM_CONTENT_TYPE) {
    const sanitized = await createMacroSafeSpreadsheetAnalysis(input.bytes);
    analysisBytes = sanitized.analysisBytes;
    protection = Object.freeze({
      macroEnabled: true,
      macroExecution: 'blocked',
      analysisMode: 'sanitized_copy',
      analysisSha256: sanitized.analysisSha256,
      macroSha256: sanitized.macroSha256,
    });
  }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(analysisBytes as never); } catch { throw new Error('XLSX_INVALID'); }
  if (workbook.worksheets.length < 1 || workbook.worksheets.length > MAX_SHEETS) throw new Error('XLSX_INVALID');
  const sheets: ParsedSheet[] = [];
  const evidence: XlsxEvidence[] = [];
  let cellCount = 0;
  for (const worksheet of workbook.worksheets) {
    if (!worksheet.name || worksheet.name.length > 128) throw new Error('XLSX_INVALID');
    const cells: ParsedCell[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.isMerged && cell.master.address !== cell.address) return;
        const normalized = cellValue(cell.value);
        if (!normalized) return;
        cellCount += 1;
        if (cellCount > MAX_CELLS) throw new Error('XLSX_LIMIT_EXCEEDED');
        cells.push({ address: cell.address, kind: normalized.kind, value: normalized.value });
      });
    });
    const mergedRanges = [...((worksheet.model as { merges?: string[] }).merges ?? [])].sort();
    cells.sort((left, right) => left.address.localeCompare(right.address, 'en', { numeric: true }));
    for (const cell of cells) {
      const content = cell.kind === 'formula' ? `FORMULA:${cell.value}` : String(cell.value);
      const contentSha256 = await sha256(content);
      evidence.push({ id: `xlsx:${sheets.length + 1}:${cell.address}`, locator: { kind: 'xlsx_cell', sourceVersionId: input.sourceVersionId, sheet: worksheet.name, cellRange: cell.address, rawEvidenceHash: contentSha256 }, content, contentSha256 });
    }
    sheets.push({ name: worksheet.name, mergedRanges, cells });
  }
  return { modelVersion: 'exceljs@4.4.0', sheets, evidence, protection };
}
