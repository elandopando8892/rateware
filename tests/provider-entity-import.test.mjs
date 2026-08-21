import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDocument, planEntityVaultImport, sha256Hex, sniffFamily, summarizeForLog,
} from '../supabase/functions/_shared/provider-entity-import.mjs';

// Synthetic bytes only. No real XBF document, name, identifier or signature appears here.
const pdf = (tail = 'a') => new Uint8Array([0x25, 0x50, 0x44, 0x46, ...new TextEncoder().encode(tail)]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
// The trailing byte varies so distinct fixtures hash differently — identical bytes are
// correctly treated as duplicates, which is exercised separately.
const zip = (tail = 1) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, tail]);
const ole2 = (tail = 1) => new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, tail]);

test('container families are identified from magic bytes', () => {
  assert.equal(sniffFamily(pdf()), 'pdf');
  assert.equal(sniffFamily(png()), 'png');
  assert.equal(sniffFamily(zip()), 'zip');
  assert.equal(sniffFamily(ole2()), 'ole2');
  assert.equal(sniffFamily(new Uint8Array([1, 2, 3])), null);
  assert.equal(sniffFamily(new Uint8Array([])), null);
});

test('the brief\'s disclosure table is applied to recognizable names', () => {
  const expected = {
    'authorized-signature-sample.png': ['authorized_signature', 'highly_restricted'],
    'XBFmx - INE_Someone.pdf': ['government_id', 'highly_restricted'],
    'XBFus - Bank Letter.pdf': ['bank_letter', 'highly_restricted'],
    'XBFus - W9.pdf': ['w9', 'restricted'],
    'XBFus - EIN Assignation.pdf': ['ein_assignation', 'restricted'],
    'XBFnx - Acta Constitutiva.pdf': ['acta_constitutiva', 'restricted'],
    'XBFmx - CSF.pdf': ['csf', 'restricted'],
    'XBFus - Articles of Organization.pdf': ['articles_of_organization', 'confidential'],
  };
  for (const [filename, [documentType, sensitivity]] of Object.entries(expected)) {
    const result = classifyDocument(filename);
    assert.equal(result.document_type, documentType, filename);
    assert.equal(result.sensitivity, sensitivity, filename);
    assert.equal(result.requires_human_classification, false, filename);
  }
});

test('an unrecognized document defaults to restricted and demands classification', () => {
  // Defaulting to a permissive class would let an unknown file be released.
  const result = classifyDocument('some vendor packet.pdf');
  assert.equal(result.document_type, 'unclassified');
  assert.equal(result.sensitivity, 'restricted');
  assert.equal(result.requires_human_classification, true);
});

test('signature and identity documents outrank generic matches', () => {
  assert.equal(classifyDocument('bank letter with firma.png').document_type, 'authorized_signature');
  assert.equal(classifyDocument('INE and bank statement.pdf').document_type, 'government_id');
});

test('a classified signature source requires separate provisioning', async () => {
  const { plans, rejections } = await planEntityVaultImport([
    { filename: 'authorized-signature-sample.png', bytes: png() },
  ]);
  assert.equal(plans.length, 0);
  assert.equal(rejections.length, 1);
  assert.equal(rejections[0].reason, 'signature_source_requires_separate_provisioning');
});

test('a plan carries hash, size, MIME, classification and a review flag', async () => {
  const { plans } = await planEntityVaultImport(
    [{ filename: 'XBFus - W9.pdf', bytes: pdf('w9') }],
    { legalEntityId: '22222222-2222-4222-8222-222222222222' },
  );
  assert.equal(plans.length, 1);
  const [plan] = plans;
  assert.match(plan.sha256, /^[0-9a-f]{64}$/);
  assert.equal(plan.sha256, await sha256Hex(pdf('w9')));
  assert.equal(plan.mime_type, 'application/pdf');
  assert.equal(plan.document_type, 'w9');
  assert.equal(plan.sensitivity, 'restricted');
  assert.equal(plan.queue_review, true);
  assert.equal(plan.legal_entity_id, '22222222-2222-4222-8222-222222222222');
});

test('content that contradicts the extension is rejected, not renamed', async () => {
  // A .pdf whose bytes are a ZIP is the shape of a malicious upload.
  const { plans, rejections } = await planEntityVaultImport([{ filename: 'packet.pdf', bytes: zip() }]);
  assert.equal(plans.length, 0);
  assert.equal(rejections[0].reason, 'content_extension_mismatch');
});

test('xlsx and docx share the ZIP family and xls and doc share OLE2', async () => {
  const { plans, rejections } = await planEntityVaultImport([
    { filename: 'setup.xlsx', bytes: zip(1) },
    { filename: 'form.docx', bytes: zip(2) },
    { filename: 'legacy.xls', bytes: ole2(3) },
    { filename: 'legacy.doc', bytes: ole2(4) },
  ]);
  assert.equal(rejections.length, 0);
  assert.deepEqual(plans.map((plan) => plan.container_family), ['zip', 'zip', 'ole2', 'ole2']);
  assert.equal(plans[0].mime_type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(plans[2].mime_type, 'application/vnd.ms-excel');
});

test('unsupported extensions, empty files and traversal names are rejected', async () => {
  const { plans, rejections } = await planEntityVaultImport([
    { filename: 'notes.txt', bytes: pdf() },
    { filename: 'empty.pdf', bytes: new Uint8Array([]) },
    { filename: '../escape.pdf', bytes: pdf() },
    { filename: '', bytes: pdf() },
  ]);
  assert.equal(plans.length, 0);
  assert.deepEqual(rejections.map((entry) => entry.reason), [
    'unsupported_extension', 'empty_file', 'invalid_filename', 'invalid_filename',
  ]);
});

test('unrecognized content with a valid extension is rejected', async () => {
  const { rejections } = await planEntityVaultImport([{ filename: 'mystery.pdf', bytes: new Uint8Array([1, 2, 3, 4]) }]);
  assert.equal(rejections[0].reason, 'unrecognized_content');
});

test('duplicates are detected within the batch and against the vault', async () => {
  const { plans, duplicates } = await planEntityVaultImport(
    [
      { filename: 'first.pdf', bytes: pdf('same') },
      { filename: 'second.pdf', bytes: pdf('same') },
      { filename: 'known.pdf', bytes: pdf('already') },
    ],
    { existingHashes: [await sha256Hex(pdf('already'))] },
  );
  assert.equal(plans.length, 1);
  assert.equal(plans[0].filename, 'first.pdf');
  assert.deepEqual(duplicates.map((entry) => entry.scope).sort(), ['batch', 'vault']);
  assert.equal(duplicates.find((entry) => entry.scope === 'batch').first_seen_as, 'first.pdf');
});

test('every plan queues review regardless of sensitivity', async () => {
  const { plans } = await planEntityVaultImport([
    { filename: 'XBFus - Articles of Organization.pdf', bytes: pdf('1') },
    { filename: 'XBFus - Bank Letter.pdf', bytes: pdf('2') },
  ]);
  assert.equal(plans.length, 2);
  for (const plan of plans) assert.equal(plan.queue_review, true);
});

test('the log summary drops the filename and truncates the hash', () => {
  const summary = summarizeForLog({
    filename: 'XBFmx - INE_Someone.pdf', sha256: 'a'.repeat(64), document_type: 'government_id',
    sensitivity: 'highly_restricted', extension: 'pdf', size_bytes: 10, requires_human_classification: false,
  });
  assert.equal(summary.filename, undefined, 'filenames are identifying and must not be logged');
  assert.equal(summary.sha256_prefix, 'aaaaaaaa');
  assert.equal(Object.values(summary).includes('a'.repeat(64)), false);
});

test('malformed input degrades to empty results rather than throwing', async () => {
  const result = await planEntityVaultImport(null);
  assert.deepEqual(result.plans, []);
  assert.deepEqual(result.duplicates, []);
  assert.deepEqual(result.rejections, []);
});

test('cryptographic key material is refused ahead of every other rule', async () => {
  // The SAT e.firma bundle ships a private key beside ordinary PDFs. A mis-aimed
  // --source must never ingest a signing key as a "document".
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]);
  const { plans, rejections } = await planEntityVaultImport([
    { filename: 'Claveprivada_FIEL_XSL260511N11_20260812_130805.key', bytes: pdf },
    { filename: '00001000000727261687.cer', bytes: pdf },
    { filename: 'FIEL_XSL260511N11_20260812130805.pdf', bytes: pdf },
    { filename: 'bundle.p12', bytes: pdf },
  ]);
  assert.equal(plans.length, 0);
  assert.equal(rejections.length, 4);
  for (const entry of rejections) assert.equal(entry.reason, 'key_material_refused');
});

test('a document that merely mentions the e.firma is not refused', async () => {
  // Over-blocking is its own failure: an appointment receipt is an ordinary PDF.
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 2]);
  const { plans, rejections } = await planEntityVaultImport([
    { filename: 'XBFmx - AcuseCita efirma.pdf', bytes: pdf },
  ]);
  assert.equal(rejections.length, 0);
  assert.equal(plans.length, 1);
});

test('the real corpus document types classify without a human', async () => {
  const pdf = (n) => new Uint8Array([0x25, 0x50, 0x44, 0x46, n]);
  const expected = {
    'XBFus - Tax Information Authorization 2024.pdf': 'tax_filing',
    'XBFus - SS4 Application.pdf': 'tax_filing',
    'XBFus - Texas Comptroller of Public Accounts 2024.pdf': 'tax_filing',
    'XBFus - UCR 2026.pdf': 'ucr_registration',
    'XBFus - BOC3 Agent.pdf': 'process_agent',
    'XBFus - Registered Agent.pdf': 'process_agent',
    'XBFus - Operating Agreement.pdf': 'governance_document',
    'XBFus - Statement of the Organizer.pdf': 'governance_document',
    'XBFmx - CIF.pdf': 'cif',
    'XBFmx - Escrito Socios 2026 (pendiente).pdf': 'governance_document',
    'Contrato de Arrendamiento XBF 2026 (borrador).pdf': 'lease_contract',
  };
  let index = 0;
  for (const [filename, documentType] of Object.entries(expected)) {
    index += 1;
    const { plans } = await planEntityVaultImport([{ filename, bytes: pdf(index) }]);
    assert.equal(plans.length, 1, filename);
    assert.equal(plans[0].document_type, documentType, filename);
    assert.equal(plans[0].requires_human_classification, false, filename);
  }
});
