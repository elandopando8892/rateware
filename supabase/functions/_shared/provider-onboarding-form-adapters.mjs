// Multi-format onboarding form adapters.
//
// Scope decision (Option B, approved 2026-08-17): PDF, XLSX and DOCX are filled
// in place. Legacy XLS and DOC are NOT converted — the original is preserved and
// the adapter returns a human-intervention outcome. No silent fidelity loss.
//
// Every adapter is required to leave the template bytes untouched and to report
// what it could not do, rather than degrading the document quietly.

import { PDFDocument, rgb } from 'pdf-lib';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export const SUPPORTED_FORMATS = Object.freeze(['pdf', 'xlsx', 'docx']);

/**
 * Formats this engine may hold but must never rewrite.
 *
 * `xls`/`doc` are the OLE2 legacy pair: no authorized converter exists.
 *
 * `xlsm`/`docm` are macro-enabled OOXML, and they are here for a sharper reason.
 * They are ZIP containers exceljs and docxtemplater can happily *read*, so the
 * questions can be extracted and mapped — but writing one back drops the VBA
 * project. A carrier form whose validation, totals or page flow live in macros
 * would return to the customer visibly broken, which is worse than declining. And
 * rewriting one would mean this system generating and returning executable
 * content, which is not a boundary to cross silently.
 *
 * So: read yes, fill never. The operator completes it in Excel with the macros
 * intact, using the values the agent proposed.
 */
export const LEGACY_FORMATS = Object.freeze(['xls', 'doc', 'xlsm', 'docm']);

/** Macro-enabled formats can still be read for question extraction. */
export const MACRO_ENABLED_FORMATS = Object.freeze(['xlsm', 'docm']);

/** The OOXML family a macro-enabled format can be parsed as. */
export const MACRO_READ_FAMILY = Object.freeze({ xlsm: 'xlsx', docm: 'docx' });

const MIME_BY_FORMAT = Object.freeze({
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
  // Gmail reports the real carrier form as exactly this type.
  xlsm: 'application/vnd.ms-excel.sheet.macroenabled.12',
  docm: 'application/vnd.ms-word.document.macroenabled.12',
});

const FORMAT_BY_MIME = Object.freeze(Object.fromEntries(
  Object.entries(MIME_BY_FORMAT).map(([format, mime]) => [mime, format]),
));

export function mimeTypeForFormat(format) {
  return MIME_BY_FORMAT[String(format ?? '').toLowerCase()] ?? null;
}

/**
 * Resolves a document format from filename and declared MIME type.
 * Disagreement between the two is an error, not a preference — a .pdf declared as
 * a spreadsheet is exactly the shape of a malicious upload.
 */
export function detectFormat(filename, declaredMimeType) {
  const extension = String(filename ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? null;
  const byMime = FORMAT_BY_MIME[String(declaredMimeType ?? '').toLowerCase().trim()] ?? null;
  if (!extension && !byMime) return null;
  if (extension && byMime && extension !== byMime) {
    throw new Error(`Declared MIME type does not match the .${extension} extension.`);
  }
  return byMime ?? (MIME_BY_FORMAT[extension] ? extension : null);
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function frozenResult(result) {
  return Object.freeze({ ...result, review_tasks: Object.freeze([...result.review_tasks]) });
}

/**
 * PDF adapter. Fills AcroForm fields where present. A flat PDF is never rewritten
 * blind: without approved overlay coordinates the adapter refuses and raises a
 * layout review task instead of producing a degraded draft.
 */
export async function fillPdf(templateBytes, fields, options = {}) {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const acroFields = new Map(form.getFields().map((field) => [field.getName(), field]));
  const reviewTasks = [];
  const filled = [];

  for (const [name, rawValue] of Object.entries(fields ?? {})) {
    const field = acroFields.get(name);
    if (!field) {
      reviewTasks.push({ kind: 'unmatched_field', field: name, reason: 'no_acroform_field_with_this_name' });
      continue;
    }
    const value = rawValue == null ? '' : String(rawValue);
    const type = field.constructor.name;
    if (type === 'PDFTextField') field.setText(value);
    else if (type === 'PDFCheckBox') { if (value === 'Yes' || value === 'true') field.check(); else field.uncheck(); }
    else if (type === 'PDFRadioGroup' || type === 'PDFDropdown') {
      const choices = field.getOptions();
      if (!choices.includes(value)) {
        reviewTasks.push({ kind: 'invalid_choice', field: name, reason: 'value_not_in_field_options' });
        continue;
      }
      field.select(value);
    } else {
      reviewTasks.push({ kind: 'unsupported_field_type', field: name, reason: type });
      continue;
    }
    filled.push(name);
  }

  const isFlat = acroFields.size === 0;
  if (isFlat) {
    const overlay = options.overlay;
    if (!Array.isArray(overlay) || overlay.length === 0) {
      reviewTasks.push({ kind: 'flat_pdf_without_approved_overlay', reason: 'layout_confidence_insufficient' });
    } else {
      const pages = pdf.getPages();
      for (const item of overlay) {
        const page = pages[Number(item.page ?? 0)];
        if (!page) { reviewTasks.push({ kind: 'overlay_page_missing', field: item.field, reason: 'page_out_of_range' }); continue; }
        const value = fields?.[item.field];
        if (value == null || String(value) === '') continue;
        page.drawText(String(value), { x: Number(item.x), y: Number(item.y), size: Number(item.size ?? 10), color: rgb(0, 0, 0) });
        filled.push(item.field);
      }
    }
  }

  if (options.signature) {
    const { pngBytes, page = 0, x, y, width, height } = options.signature;
    const image = await pdf.embedPng(pngBytes);
    const target = pdf.getPages()[Number(page)];
    if (!target) throw new Error('Signature page is out of range.');
    target.drawImage(image, { x: Number(x), y: Number(y), width: Number(width), height: Number(height) });
  }

  const bytes = await pdf.save();
  return frozenResult({
    format: 'pdf',
    bytes,
    filled_fields: filled,
    fidelity: isFlat && reviewTasks.some((task) => task.kind === 'flat_pdf_without_approved_overlay') ? 'requires_human_layout_review' : 'preserved',
    review_tasks: reviewTasks,
  });
}

/**
 * XLSX adapter. Targets are `Sheet!Cell` addresses. Formula cells are never
 * overwritten — a mapping that lands on one is refused and raised for review,
 * so a fill can't silently destroy a workbook's calculations.
 */
export async function fillXlsx(templateBytes, fields) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes);
  const reviewTasks = [];
  const filled = [];

  for (const [target, rawValue] of Object.entries(fields ?? {})) {
    const match = String(target).match(/^(.+)!([A-Z]+\d+)$/);
    if (!match) { reviewTasks.push({ kind: 'invalid_cell_target', field: target, reason: 'expected_Sheet!A1_form' }); continue; }
    const [, sheetName, address] = match;
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) { reviewTasks.push({ kind: 'missing_sheet', field: target, reason: sheetName }); continue; }
    const cell = sheet.getCell(address);
    if (cell.type === ExcelJS.ValueType.Formula || (cell.value && typeof cell.value === 'object' && 'formula' in cell.value)) {
      reviewTasks.push({ kind: 'formula_cell_protected', field: target, reason: 'refused_to_overwrite_formula' });
      continue;
    }
    if (rawValue == null || String(rawValue) === '') continue;
    cell.value = rawValue;
    filled.push(target);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return frozenResult({
    format: 'xlsx',
    bytes: new Uint8Array(buffer),
    filled_fields: filled,
    fidelity: 'preserved',
    review_tasks: reviewTasks,
  });
}

/**
 * DOCX adapter. Placeholders are `{field}` tags authored into the template, which
 * keeps tables, headers, footers and page breaks intact — no structural rewriting.
 */
export async function fillDocx(templateBytes, fields) {
  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  const values = Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, value == null ? '' : String(value)]));
  doc.render(values);
  const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return frozenResult({
    format: 'docx',
    bytes: new Uint8Array(buffer),
    filled_fields: Object.keys(values),
    fidelity: 'preserved',
    review_tasks: [],
  });
}

/**
 * Single entry point used by the assembly worker.
 * Legacy XLS/DOC deliberately return the untouched original plus a human task:
 * automated conversion is out of scope until an isolated converter is approved.
 */
export async function assembleFormDocument({ format, templateBytes, fields = {}, overlay = null, signature = null }) {
  const normalized = String(format ?? '').toLowerCase();
  if (LEGACY_FORMATS.includes(normalized)) {
    const macroEnabled = MACRO_ENABLED_FORMATS.includes(normalized);
    return frozenResult({
      format: normalized,
      bytes: templateBytes,
      filled_fields: [],
      fidelity: 'original_preserved',
      review_tasks: [{
        kind: 'legacy_format_requires_human_conversion',
        // The two reasons are different work for the operator: a legacy OLE2 file
        // needs converting, a macro-enabled one needs filling in Excel as-is.
        reason: macroEnabled
          ? `${normalized}_macro_preserving_fill_required`
          : `${normalized}_conversion_not_authorized`,
      }],
    });
  }
  if (!SUPPORTED_FORMATS.includes(normalized)) throw new Error(`Unsupported form format: ${format}`);
  if (!(templateBytes instanceof Uint8Array) && !Buffer.isBuffer(templateBytes)) {
    throw new Error('templateBytes must be binary.');
  }
  if (normalized === 'pdf') return fillPdf(templateBytes, fields, { overlay, signature });
  if (normalized === 'xlsx') return fillXlsx(templateBytes, fields);
  return fillDocx(templateBytes, fields);
}

/** Hashes and sizes an assembled artifact for the immutable assembly record. */
export async function describeArtifact(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Object.freeze({ sha256: await sha256Hex(view), sizeBytes: view.byteLength });
}
