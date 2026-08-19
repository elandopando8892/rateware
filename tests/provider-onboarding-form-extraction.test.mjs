import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import {
  extractAndMapForm, extractDocxQuestions, extractFormQuestions,
  extractPdfQuestions, extractXlsxQuestions,
} from '../supabase/functions/_shared/provider-onboarding-form-extraction.mjs';

// Synthetic fixtures built in-process. No real packet, provider or identifier.

async function acroPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 500]);
  const form = pdf.getForm();
  form.createTextField('Legal Name').addToPage(page, { x: 50, y: 420, width: 300, height: 20 });
  form.createTextField('Federal Tax ID').addToPage(page, { x: 50, y: 380, width: 300, height: 20 });
  form.createCheckBox('authorized').addToPage(page, { x: 50, y: 340, width: 15, height: 15 });
  const dropdown = form.createDropdown('Terms Requested');
  dropdown.addOptions(['NET 15', 'NET 30']);
  dropdown.addToPage(page, { x: 50, y: 300, width: 150, height: 20 });
  return new Uint8Array(await pdf.save());
}

async function flatPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 400]).drawText('Synthetic packet', { x: 50, y: 350, size: 12 });
  return new Uint8Array(await pdf.save());
}

async function xlsx() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Application');
  sheet.getCell('A1').value = 'Legal Name';        // B1 empty  → question
  sheet.getCell('A2').value = 'Federal Tax ID';    // B2 empty  → question
  sheet.getCell('A3').value = 'Requested Credit Line';
  sheet.getCell('A5').value = 'Total';
  sheet.getCell('B5').value = { formula: 'SUM(B3:B4)', result: 0 };  // formula → never offered
  sheet.getCell('A6').value = 'Already answered';
  sheet.getCell('B6').value = 'filled in';         // not empty → not a question
  sheet.getCell('A7').value = 12345;               // numeric   → not a label
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function docx() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:t>Signer: {signature_name}</w:t></w:r></w:p>'
    + '<w:tbl>'
    + '<w:tr><w:tc><w:p><w:r><w:t>Trade Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>MC #</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>Country</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Mexico</w:t></w:r></w:p></w:tc></w:tr>'
    + '</w:tbl></w:body></w:document>');
  return new Uint8Array(zip.generate({ type: 'nodebuffer' }));
}

test('PDF AcroForm fields become questions with their write target', async () => {
  const result = await extractPdfQuestions(await acroPdf());
  const labels = result.questions.map((q) => q.label);
  assert.deepEqual(labels.sort(), ['Federal Tax ID', 'Legal Name', 'Terms Requested', 'authorized']);
  assert.equal(result.is_flat, false);
  const dropdown = result.questions.find((q) => q.label === 'Terms Requested');
  assert.equal(dropdown.kind, 'choice');
  assert.deepEqual([...dropdown.options], ['NET 15', 'NET 30']);
  assert.equal(result.questions.find((q) => q.label === 'authorized').kind, 'boolean');
});

test('a flat PDF yields no questions and reports itself as flat', async () => {
  const result = await extractPdfQuestions(await flatPdf());
  assert.deepEqual(result.questions, []);
  assert.equal(result.is_flat, true, 'the caller routes this to human layout review');
});

test('XLSX label cells with an empty neighbour become questions', async () => {
  const result = await extractXlsxQuestions(await xlsx());
  const byLabel = Object.fromEntries(result.questions.map((q) => [q.label, q.target]));
  assert.equal(byLabel['Legal Name'], 'Application!B1');
  assert.equal(byLabel['Federal Tax ID'], 'Application!B2');
});

test('XLSX never offers a formula cell as a write target', async () => {
  // The fill adapter refuses to overwrite formulas, so proposing one would create a
  // question that can never be answered.
  const result = await extractXlsxQuestions(await xlsx());
  assert.ok(!result.questions.some((q) => q.target === 'Application!B5'));
  assert.ok(!result.questions.some((q) => q.label === 'Total'));
});

test('XLSX skips answered cells and numeric cells', async () => {
  const result = await extractXlsxQuestions(await xlsx());
  assert.ok(!result.questions.some((q) => q.label === 'Already answered'));
  assert.ok(!result.questions.some((q) => /^\d+$/.test(q.label)));
});

test('DOCX reads both placeholders and empty table rows', () => {
  const result = extractDocxQuestions(docx());
  const labels = result.questions.map((q) => q.label);
  assert.ok(labels.includes('signature name'), 'placeholder becomes a question');
  assert.ok(labels.includes('Trade Name'));
  assert.ok(labels.includes('MC #'));
});

test('DOCX skips a table row that already has an answer', () => {
  const result = extractDocxQuestions(docx());
  assert.ok(!result.questions.some((q) => q.label === 'Country'));
});

test('legacy formats are not extractable and say so', async () => {
  for (const format of ['xls', 'doc']) {
    const result = await extractFormQuestions({ format, bytes: new Uint8Array([1, 2, 3]) });
    assert.deepEqual(result.questions, []);
    assert.equal(result.requires_human_conversion, true);
  }
  await assert.rejects(extractFormQuestions({ format: 'rtf', bytes: new Uint8Array([1]) }), /Unsupported/);
});

test('extraction maps through the ontology and carries the write target', async () => {
  const facts = { legal_name: { value: 'Synthetic Freight Systems LLC', evidence_document_id: 'doc-1' } };
  const result = await extractAndMapForm({ format: 'pdf', bytes: await acroPdf(), facts });

  const legal = result.rows.find((row) => row.field_code === 'legal_name');
  assert.equal(legal.proposed_value, 'Synthetic Freight Systems LLC');
  assert.equal(legal.status, 'proposed');
  assert.equal(legal.target, 'Legal Name', 'the write target rides along for the fill step');

  const ein = result.rows.find((row) => row.field_code === 'ein');
  assert.equal(ein.status, 'pending', 'no canonical fact yet');
  assert.equal(ein.proposed_value, null);
});

test('a never-inferred field needs review even with a fact present', async () => {
  const facts = { payment_terms: { value: 'NET 30' } };
  const result = await extractAndMapForm({ format: 'pdf', bytes: await acroPdf(), facts });
  const terms = result.rows.find((row) => row.field_code === 'payment_terms');
  assert.equal(terms.status, 'needs_review');
  assert.deepEqual([...terms.options], ['NET 15', 'NET 30'], 'choices survive extraction');
});

test('an empty vault makes every row pending — the correct answer, not a failure', async () => {
  const result = await extractAndMapForm({ format: 'pdf', bytes: await acroPdf(), facts: {} });
  assert.equal(result.summary.proposed, 0);
  assert.equal(result.summary.pending, result.summary.total);
  assert.ok(result.rows.every((row) => row.proposed_value === null), 'nothing is invented against an empty vault');
});

test('an unmappable field is surfaced, never dropped', async () => {
  const result = await extractAndMapForm({ format: 'pdf', bytes: await acroPdf(), facts: {} });
  const unmapped = result.rows.find((row) => row.field_code === null);
  assert.ok(unmapped, 'the checkbox has no ontology match and must still appear');
  assert.equal(unmapped.status, 'pending');
  assert.ok(unmapped.original_question, 'its raw label is retained for review');
});

test('the summary accounts for every row', async () => {
  const result = await extractAndMapForm({ format: 'pdf', bytes: await acroPdf(), facts: { legal_name: { value: 'X' } } });
  const { total, proposed, needs_review, pending } = result.summary;
  assert.equal(total, result.rows.length);
  assert.equal(proposed + needs_review + pending, total);
});

test('a macro-enabled workbook is still read, so the agent can map its questions', async () => {
  // The value of a carrier's .xlsm is in reading it: the agent extracts the
  // questions and proposes values even though it must never write the file back.
  const bytes = await xlsx();
  const extraction = await extractFormQuestions({ format: 'xlsm', bytes });
  assert.equal(extraction.format, 'xlsm');
  assert.ok(extraction.questions.length > 0, 'questions must be extracted from a macro-enabled workbook');
  // The caller still needs to know a human completes the fill.
  assert.equal(extraction.requires_human_conversion, true);
});

test('an OLE2 legacy file yields no questions at all', async () => {
  const extraction = await extractFormQuestions({ format: 'xls', bytes: new Uint8Array([1, 2, 3]) });
  assert.deepEqual(extraction.questions, []);
  assert.equal(extraction.requires_human_conversion, true);
});
