import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import {
  assembleFormDocument, describeArtifact, detectFormat,
  fillDocx, fillPdf, fillXlsx, mimeTypeForFormat,
} from '../supabase/functions/_shared/provider-onboarding-form-adapters.mjs';

// All fixtures are synthetic and built in-process. No real XBF document, name,
// identifier or signature is used anywhere in this suite.

async function acroFormFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 400]);
  const form = pdf.getForm();
  form.createTextField('legal_name').addToPage(page, { x: 50, y: 300, width: 300, height: 20 });
  form.createTextField('mc_number').addToPage(page, { x: 50, y: 260, width: 300, height: 20 });
  form.createCheckBox('authorized').addToPage(page, { x: 50, y: 220, width: 15, height: 15 });
  const dropdown = form.createDropdown('payment_terms');
  dropdown.addOptions(['NET 15', 'NET 30']);
  dropdown.addToPage(page, { x: 50, y: 180, width: 150, height: 20 });
  return new Uint8Array(await pdf.save());
}

async function flatPdfFixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 400]).drawText('Synthetic vendor packet', { x: 50, y: 350, size: 12 });
  return new Uint8Array(await pdf.save());
}

async function xlsxFixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Application');
  sheet.getCell('A1').value = 'Legal name';
  sheet.getCell('B3').value = 10;
  sheet.getCell('B4').value = 20;
  sheet.getCell('B5').value = { formula: 'SUM(B3:B4)', result: 30 };
  sheet.getColumn('B').width = 42;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function docxFixture() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Legal name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{legal_name}</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Signer: {signature_name}</w:t></w:r></w:p></w:body></w:document>');
  return new Uint8Array(zip.generate({ type: 'nodebuffer' }));
}

test('format detection agrees with the declared MIME type or refuses', () => {
  assert.equal(detectFormat('packet.pdf', 'application/pdf'), 'pdf');
  assert.equal(detectFormat('setup.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
  assert.equal(detectFormat('form.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.equal(detectFormat('legacy.xls', 'application/vnd.ms-excel'), 'xls');
  assert.equal(detectFormat('unknown.txt', null), null);
  assert.throws(() => detectFormat('packet.pdf', 'application/vnd.ms-excel'), /does not match/);
  assert.equal(mimeTypeForFormat('docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('AcroForm PDF fields are filled and read back', async () => {
  const result = await fillPdf(await acroFormFixture(), {
    legal_name: 'Synthetic Freight Systems LLC',
    mc_number: 'MC-000000',
    authorized: 'Yes',
    payment_terms: 'NET 30',
  });
  assert.equal(result.fidelity, 'preserved');
  assert.deepEqual([...result.filled_fields].sort(), ['authorized', 'legal_name', 'mc_number', 'payment_terms']);

  const reloaded = (await PDFDocument.load(result.bytes)).getForm();
  assert.equal(reloaded.getTextField('legal_name').getText(), 'Synthetic Freight Systems LLC');
  assert.equal(reloaded.getTextField('mc_number').getText(), 'MC-000000');
  assert.equal(reloaded.getCheckBox('authorized').isChecked(), true);
  assert.deepEqual(reloaded.getDropdown('payment_terms').getSelected(), ['NET 30']);
});

test('a value outside a dropdown option list is refused, not coerced', async () => {
  const result = await fillPdf(await acroFormFixture(), { payment_terms: 'NET 90' });
  assert.ok(!result.filled_fields.includes('payment_terms'));
  assert.equal(result.review_tasks.find((task) => task.field === 'payment_terms').kind, 'invalid_choice');
});

test('a mapping with no matching AcroForm field raises review instead of failing silently', async () => {
  const result = await fillPdf(await acroFormFixture(), { nonexistent_field: 'x' });
  assert.equal(result.review_tasks[0].kind, 'unmatched_field');
});

test('a flat PDF without approved overlay coordinates refuses to produce a degraded draft', async () => {
  const result = await fillPdf(await flatPdfFixture(), { legal_name: 'Synthetic Freight Systems LLC' });
  assert.equal(result.fidelity, 'requires_human_layout_review');
  assert.ok(result.review_tasks.some((task) => task.kind === 'flat_pdf_without_approved_overlay'));
});

test('a flat PDF with approved overlay coordinates produces a usable draft', async () => {
  const result = await fillPdf(await flatPdfFixture(), { legal_name: 'Synthetic Freight Systems LLC' }, {
    overlay: [{ page: 0, field: 'legal_name', x: 60, y: 200, size: 11 }],
  });
  assert.equal(result.fidelity, 'preserved');
  assert.deepEqual(result.filled_fields, ['legal_name']);
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
});

test('page size and page count survive a PDF fill', async () => {
  const template = await acroFormFixture();
  const before = (await PDFDocument.load(template)).getPage(0).getSize();
  const result = await fillPdf(template, { legal_name: 'Synthetic Freight Systems LLC' });
  const after = (await PDFDocument.load(result.bytes)).getPage(0).getSize();
  assert.deepEqual(after, before);
});

test('XLSX fill preserves formulas, column widths and untouched cells', async () => {
  const result = await fillXlsx(await xlsxFixture(), { 'Application!B1': 'Synthetic Freight Systems LLC' });
  assert.equal(result.fidelity, 'preserved');
  assert.deepEqual(result.filled_fields, ['Application!B1']);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.bytes);
  const sheet = workbook.getWorksheet('Application');
  assert.equal(sheet.getCell('B1').value, 'Synthetic Freight Systems LLC');
  assert.equal(sheet.getCell('B5').value.formula, 'SUM(B3:B4)');
  assert.equal(sheet.getCell('A1').value, 'Legal name');
  assert.equal(sheet.getColumn('B').width, 42);
});

test('XLSX fill refuses to overwrite a formula cell', async () => {
  const result = await fillXlsx(await xlsxFixture(), { 'Application!B5': 999 });
  assert.equal(result.filled_fields.length, 0);
  assert.equal(result.review_tasks[0].kind, 'formula_cell_protected');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.bytes);
  assert.equal(workbook.getWorksheet('Application').getCell('B5').value.formula, 'SUM(B3:B4)');
});

test('XLSX targets must be Sheet!Cell and missing sheets are reported', async () => {
  const result = await fillXlsx(await xlsxFixture(), { legal_name: 'x', 'Missing!A1': 'y' });
  const kinds = result.review_tasks.map((task) => task.kind).sort();
  assert.deepEqual(kinds, ['invalid_cell_target', 'missing_sheet']);
});

test('DOCX fill keeps the table structure and substitutes placeholders', async () => {
  const result = await fillDocx(docxFixture(), {
    legal_name: 'Synthetic Freight Systems LLC',
    signature_name: 'Synthetic Signer',
  });
  assert.equal(result.fidelity, 'preserved');
  const xml = new PizZip(result.bytes).file('word/document.xml').asText();
  assert.match(xml, /Synthetic Freight Systems LLC/);
  assert.match(xml, /Synthetic Signer/);
  assert.match(xml, /<w:tbl>/, 'table markup must survive');
  assert.doesNotMatch(xml, /\{legal_name\}/);
});

test('legacy XLS and DOC preserve the original and demand human conversion', async () => {
  for (const format of ['xls', 'doc']) {
    const original = new Uint8Array([1, 2, 3, 4]);
    const result = await assembleFormDocument({ format, templateBytes: original, fields: { legal_name: 'x' } });
    assert.equal(result.fidelity, 'original_preserved');
    assert.deepEqual(result.bytes, original, 'legacy original must be returned byte-identical');
    assert.equal(result.filled_fields.length, 0);
    assert.equal(result.review_tasks[0].kind, 'legacy_format_requires_human_conversion');
  }
});

test('unsupported formats and non-binary templates are rejected', async () => {
  await assert.rejects(assembleFormDocument({ format: 'rtf', templateBytes: new Uint8Array([1]) }), /Unsupported form format/);
  await assert.rejects(assembleFormDocument({ format: 'pdf', templateBytes: 'not-binary' }), /must be binary/);
});

test('the dispatcher routes each supported format to its adapter', async () => {
  const pdf = await assembleFormDocument({ format: 'pdf', templateBytes: await acroFormFixture(), fields: { legal_name: 'Synthetic Freight Systems LLC' } });
  assert.equal(pdf.format, 'pdf');
  const xlsx = await assembleFormDocument({ format: 'xlsx', templateBytes: await xlsxFixture(), fields: { 'Application!B1': 'x' } });
  assert.equal(xlsx.format, 'xlsx');
  const docx = await assembleFormDocument({ format: 'docx', templateBytes: docxFixture(), fields: { legal_name: 'x', signature_name: 'y' } });
  assert.equal(docx.format, 'docx');
});

test('artifact description yields a stable SHA-256 and byte length', async () => {
  const bytes = new Uint8Array([0, 1, 2, 3]);
  const described = await describeArtifact(bytes);
  assert.match(described.sha256, /^[0-9a-f]{64}$/);
  assert.equal(described.sizeBytes, 4);
  assert.deepEqual(await describeArtifact(bytes), described);
});

test('template bytes are never mutated by a fill', async () => {
  const template = await acroFormFixture();
  const copy = Uint8Array.from(template);
  await fillPdf(template, { legal_name: 'Synthetic Freight Systems LLC' });
  assert.deepEqual(template, copy, 'the original template must remain immutable');
});
