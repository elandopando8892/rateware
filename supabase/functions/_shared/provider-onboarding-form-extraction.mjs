// Sprint 3: read a form and produce the question list.
//
// The adapters in provider-onboarding-form-adapters.mjs can FILL a document. Nothing
// could read one. This extracts the questions a provider is asking, with the write
// target for each, so the ontology can map them and an operator can review them.
//
// Extraction never invents a question and never answers one. A field it cannot
// interpret is returned as unmapped with its raw label, which becomes a review task
// rather than a silent omission.

import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { mapExtractedFields } from './provider-onboarding-ontology.mjs';

export const EXTRACTION_VERSION = '2026.08.17';

const MAX_QUESTIONS = 400;
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function question(label, target, kind, extra = {}) {
  return Object.freeze({
    label,
    target,
    kind,
    ...extra,
    extraction_version: EXTRACTION_VERSION,
  });
}

/**
 * PDF: enumerate AcroForm fields. The field name is the write target; the field's
 * own label is not recoverable from the form dictionary, so the name doubles as the
 * question text and the ontology does the interpreting.
 */
export async function extractPdfQuestions(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const fields = pdf.getForm().getFields();
  const questions = [];
  for (const field of fields.slice(0, MAX_QUESTIONS)) {
    const name = clean(field.getName());
    if (!name) continue;
    const type = field.constructor.name;
    if (type === 'PDFTextField') {
      questions.push(question(name, name, 'text'));
    } else if (type === 'PDFCheckBox') {
      questions.push(question(name, name, 'boolean'));
    } else if (type === 'PDFRadioGroup' || type === 'PDFDropdown') {
      questions.push(question(name, name, 'choice', { options: Object.freeze(field.getOptions().map(clean)) }));
    } else {
      // Signature fields and anything unrecognized are surfaced, not dropped —
      // a signature placeholder is a question a human must answer.
      questions.push(question(name, name, 'unsupported', { field_type: type }));
    }
  }
  return Object.freeze({
    format: 'pdf',
    questions: Object.freeze(questions),
    // A flat PDF yields nothing here; that is a fact about the document, not a
    // failure, and the caller routes it to human layout review.
    is_flat: fields.length === 0,
  });
}

/**
 * XLSX: a label cell whose neighbour is empty is a question. Scans right first, then
 * below, because onboarding sheets use both layouts. Formula cells are never offered
 * as targets — the fill adapter refuses to overwrite them, so proposing one would
 * produce a question that can never be answered.
 */
export async function extractXlsxQuestions(bytes) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const questions = [];

  const isFormula = (cell) => cell?.type === ExcelJS.ValueType.Formula
    || (cell?.value && typeof cell.value === 'object' && 'formula' in cell.value);
  const isEmpty = (cell) => cell == null || cell.value == null || clean(String(cell.value?.text ?? cell.value)) === '';

  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        if (questions.length >= MAX_QUESTIONS) return;
        if (isFormula(cell)) return;
        const label = clean(String(cell.value?.text ?? cell.value ?? ''));
        // A label is short prose, not a paragraph and not a number.
        if (!label || label.length > 120 || /^[\d.,$%-]+$/.test(label)) return;

        const right = sheet.getCell(rowNumber, colNumber + 1);
        if (isEmpty(right) && !isFormula(right)) {
          questions.push(question(label, `${sheet.name}!${right.address}`, 'text', { sheet: sheet.name }));
          return;
        }
        const below = sheet.getCell(rowNumber + 1, colNumber);
        if (isEmpty(below) && !isFormula(below) && /:$/.test(label)) {
          questions.push(question(label, `${sheet.name}!${below.address}`, 'text', { sheet: sheet.name }));
        }
      });
    });
  }
  return Object.freeze({ format: 'xlsx', questions: Object.freeze(questions), is_flat: false });
}

/**
 * DOCX: `{placeholder}` tags are explicit targets. Table rows whose first cell is a
 * label and whose second is empty are the common packet layout and are read too.
 */
export function extractDocxQuestions(bytes) {
  const xml = new PizZip(bytes).file('word/document.xml')?.asText() || '';
  const questions = [];
  const seen = new Set();

  for (const match of xml.matchAll(/\{([a-zA-Z0-9_]{2,64})\}/g)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    questions.push(question(name.replaceAll('_', ' '), name, 'text', { placeholder: true }));
  }

  // Table rows: <w:tr> containing two <w:tc>, first with text, second without.
  for (const row of xml.matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)) {
    if (questions.length >= MAX_QUESTIONS) break;
    const cells = [...row[1].matchAll(/<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g)].map((cell) =>
      clean([...cell[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('')));
    if (cells.length < 2) continue;
    const [label, value] = cells;
    if (!label || label.length > 120 || value !== '') continue;
    if (seen.has(label)) continue;
    seen.add(label);
    questions.push(question(label, label, 'text', { table_row: true }));
  }
  return Object.freeze({ format: 'docx', questions: Object.freeze(questions), is_flat: false });
}

/** Single entry point. Legacy xls/doc are not extractable — human conversion first. */
export async function extractFormQuestions({ format, bytes }) {
  const normalized = String(format ?? '').toLowerCase();
  if (normalized === 'pdf') return extractPdfQuestions(bytes);
  if (normalized === 'xlsx') return extractXlsxQuestions(bytes);
  if (normalized === 'docx') return extractDocxQuestions(bytes);
  // Macro-enabled OOXML is a ZIP container the same parsers can read, so its
  // questions ARE extractable — the agent maps them and proposes values as usual.
  // Only the write-back is refused, because rewriting drops the VBA project. The
  // flag travels with the result so the caller still raises the human-fill task.
  if (normalized === 'xlsm' || normalized === 'docm') {
    const extraction = normalized === 'xlsm'
      ? await extractXlsxQuestions(bytes)
      : await extractDocxQuestions(bytes);
    return Object.freeze({
      ...extraction,
      format: normalized,
      requires_human_conversion: true,
    });
  }
  if (normalized === 'xls' || normalized === 'doc') {
    return Object.freeze({
      format: normalized,
      questions: Object.freeze([]),
      is_flat: false,
      requires_human_conversion: true,
    });
  }
  throw new Error(`Unsupported form format: ${format}`);
}

/**
 * Extracts and maps in one pass.
 *
 * Returns one row per question with its write target and the ontology's verdict.
 * Missing canonical facts stay pending — with an empty vault every row is pending,
 * which is the correct answer, not a failure.
 */
export async function extractAndMapForm({ format, bytes, facts = {} }) {
  const extraction = await extractFormQuestions({ format, bytes });
  const mapped = mapExtractedFields(extraction.questions.map((item) => item.label), facts);
  const rows = extraction.questions.map((item, index) => Object.freeze({
    ...mapped[index],
    target: item.target,
    kind: item.kind,
    options: item.options ?? null,
  }));
  const answered = rows.filter((row) => row.status === 'proposed').length;
  const review = rows.filter((row) => row.status === 'needs_review').length;
  return Object.freeze({
    format: extraction.format,
    is_flat: extraction.is_flat ?? false,
    requires_human_conversion: extraction.requires_human_conversion ?? false,
    rows: Object.freeze(rows),
    summary: Object.freeze({
      total: rows.length,
      proposed: answered,
      needs_review: review,
      pending: rows.length - answered - review,
    }),
    extraction_version: EXTRACTION_VERSION,
  });
}
