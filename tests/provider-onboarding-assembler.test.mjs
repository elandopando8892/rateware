import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createProviderOnboardingAssembler } from '../supabase/functions/_shared/provider-onboarding-assembler.mjs';
import { describeArtifact } from '../supabase/functions/_shared/provider-onboarding-form-adapters.mjs';

const VAULT = 'provider-entity-vault';

async function acroTemplate() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 400]);
  pdf.getForm().createTextField('legal_name').addToPage(page, { x: 50, y: 300, width: 300, height: 20 });
  return new Uint8Array(await pdf.save());
}

// A synthetic 1x1 transparent PNG. No real signature image is used anywhere.
function signaturePng() {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}

function fakeSupabase({ objects = new Map(), assets = new Map() } = {}) {
  const uploads = [];
  const publicUrlCalls = [];
  return {
    uploads,
    publicUrlCalls,
    storage: {
      from(bucket) {
        return {
          async download(path) {
            const bytes = objects.get(`${bucket}/${path}`);
            return bytes ? { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), error: null } : { data: null, error: new Error('not found') };
          },
          async upload(path, bytes, options) {
            uploads.push({ bucket, path, bytes, options });
            return { data: { path }, error: null };
          },
          getPublicUrl(path) { publicUrlCalls.push(path); return { data: { publicUrl: 'http://public' } }; },
        };
      },
    },
    from() {
      let assetId = null;
      const builder = {
        select() { return builder; },
        eq(column, value) { if (column === 'id') assetId = value; return builder; },
        async maybeSingle() { return { data: assets.get(assetId) ?? null, error: null }; },
      };
      return builder;
    },
  };
}

async function pdfScenario(overrides = {}) {
  const templateBytes = await acroTemplate();
  const { sha256 } = await describeArtifact(templateBytes);
  const objects = new Map([[`${VAULT}/templates/packet.pdf`, templateBytes]]);
  const supabase = fakeSupabase({ objects, ...overrides });
  return {
    supabase,
    objects,
    template: { bucket: VAULT, path: 'templates/packet.pdf', sha256 },
    output: { bucket: VAULT, path: 'assembled/org/assembly.pdf' },
  };
}

test('assembles a PDF, stores it privately and returns a hashed descriptor', async () => {
  const scenario = await pdfScenario();
  const assembler = createProviderOnboardingAssembler(scenario.supabase);
  const result = await assembler.assembleAndStore({
    template: scenario.template,
    fields: { legal_name: 'Synthetic Freight Systems LLC' },
    documentReferences: [{ assetId: 'a', sha256: 'b', disclosureMode: 'full' }],
    signatureReference: null,
    output: scenario.output,
  });

  assert.equal(result.bucket, VAULT);
  assert.equal(result.path, scenario.output.path);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.ok(result.sizeBytes > 0);
  assert.deepEqual(result.filledFields, ['legal_name']);
  assert.equal(result.documentReferenceCount, 1);

  assert.equal(scenario.supabase.uploads.length, 1);
  assert.equal(scenario.supabase.uploads[0].bucket, VAULT);
  assert.equal(scenario.supabase.uploads[0].options.upsert, false, 'assembled artifacts must never overwrite');
  const stored = scenario.supabase.uploads[0].bytes;
  assert.equal((await describeArtifact(stored)).sha256, result.sha256, 'stored bytes must match the recorded hash');
});

test('no public URL is ever requested for a private artifact', async () => {
  const scenario = await pdfScenario();
  const assembler = createProviderOnboardingAssembler(scenario.supabase);
  await assembler.assembleAndStore({
    template: scenario.template, fields: { legal_name: 'x' },
    documentReferences: [], signatureReference: null, output: scenario.output,
  });
  assert.deepEqual(scenario.supabase.publicUrlCalls, []);
});

test('a template that changed after approval is refused', async () => {
  const scenario = await pdfScenario();
  const tampered = { ...scenario.template, sha256: 'f'.repeat(64) };
  const assembler = createProviderOnboardingAssembler(scenario.supabase);
  await assert.rejects(assembler.assembleAndStore({
    template: tampered, fields: {}, documentReferences: [], signatureReference: null, output: scenario.output,
  }), /template changed after approval/);
  assert.equal(scenario.supabase.uploads.length, 0, 'nothing may be stored when authorization is invalid');
});

test('a stored signature is applied only where an operator approved a placement', async () => {
  const png = signaturePng();
  const { sha256: pngHash } = await describeArtifact(png);
  const scenario = await pdfScenario({
    assets: new Map([['sig-1', { storage_bucket: VAULT, storage_path: 'signatures/sig.png', file_sha256: pngHash }]]),
  });
  scenario.objects.set(`${VAULT}/signatures/sig.png`, png);
  const signatureReference = { method: 'stored_signature_asset', assetId: 'sig-1', scopeSha256: 'a'.repeat(64) };

  const withoutPlacement = createProviderOnboardingAssembler(scenario.supabase);
  await assert.rejects(withoutPlacement.assembleAndStore({
    template: scenario.template, fields: {}, documentReferences: [], signatureReference, output: scenario.output,
  }), /No approved signature placement/);

  const withPlacement = createProviderOnboardingAssembler(scenario.supabase, {
    signaturePlacements: { 'templates/packet.pdf': { page: 0, x: 60, y: 100, width: 120, height: 40 } },
  });
  const result = await withPlacement.assembleAndStore({
    template: scenario.template, fields: { legal_name: 'Synthetic Freight Systems LLC' },
    documentReferences: [], signatureReference, output: scenario.output,
  });
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
});

test('a signature asset whose bytes do not match its registered hash is rejected', async () => {
  const png = signaturePng();
  const scenario = await pdfScenario({
    assets: new Map([['sig-1', { storage_bucket: VAULT, storage_path: 'signatures/sig.png', file_sha256: 'b'.repeat(64) }]]),
  });
  scenario.objects.set(`${VAULT}/signatures/sig.png`, png);
  const assembler = createProviderOnboardingAssembler(scenario.supabase, {
    signaturePlacements: { 'templates/packet.pdf': { page: 0, x: 60, y: 100, width: 120, height: 40 } },
  });
  await assert.rejects(assembler.assembleAndStore({
    template: scenario.template, fields: {}, documentReferences: [],
    signatureReference: { method: 'stored_signature_asset', assetId: 'sig-1', scopeSha256: 'a'.repeat(64) },
    output: scenario.output,
  }), /do not match the registered hash/);
});

test('external e-sign and manual wet signatures draw nothing into the artifact', async () => {
  for (const method of ['external_esign', 'manual_wet']) {
    const scenario = await pdfScenario();
    const assembler = createProviderOnboardingAssembler(scenario.supabase);
    const result = await assembler.assembleAndStore({
      template: scenario.template, fields: { legal_name: 'Synthetic Freight Systems LLC' },
      documentReferences: [], signatureReference: { method, assetId: null, scopeSha256: 'a'.repeat(64) },
      output: scenario.output,
    });
    assert.equal(scenario.supabase.uploads.length, 1, `${method} must still produce an artifact`);
    assert.ok(result.sizeBytes > 0);
  }
});

test('a flat template without an approved overlay refuses rather than degrading', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 400]).drawText('Synthetic packet', { x: 50, y: 350, size: 12 });
  const templateBytes = new Uint8Array(await pdf.save());
  const { sha256 } = await describeArtifact(templateBytes);
  const supabase = fakeSupabase({ objects: new Map([[`${VAULT}/templates/flat.pdf`, templateBytes]]) });
  const assembler = createProviderOnboardingAssembler(supabase);
  await assert.rejects(assembler.assembleAndStore({
    template: { bucket: VAULT, path: 'templates/flat.pdf', sha256 },
    fields: { legal_name: 'x' }, documentReferences: [], signatureReference: null,
    output: { bucket: VAULT, path: 'assembled/org/a.pdf' },
  }), /human layout review is required/);
  assert.equal(supabase.uploads.length, 0);
});

test('a legacy template is refused at assembly with a conversion message', async () => {
  const templateBytes = new Uint8Array([1, 2, 3, 4]);
  const { sha256 } = await describeArtifact(templateBytes);
  const supabase = fakeSupabase({ objects: new Map([[`${VAULT}/templates/legacy.doc`, templateBytes]]) });
  const assembler = createProviderOnboardingAssembler(supabase);
  await assert.rejects(assembler.assembleAndStore({
    template: { bucket: VAULT, path: 'templates/legacy.doc', sha256 },
    fields: {}, documentReferences: [], signatureReference: null,
    output: { bucket: VAULT, path: 'assembled/org/a.doc' },
  }), /requires human conversion/);
  assert.equal(supabase.uploads.length, 0);
});

test('an unreadable private template surfaces an error and stores nothing', async () => {
  const supabase = fakeSupabase();
  const assembler = createProviderOnboardingAssembler(supabase);
  await assert.rejects(assembler.assembleAndStore({
    template: { bucket: VAULT, path: 'templates/missing.pdf', sha256: 'a'.repeat(64) },
    fields: {}, documentReferences: [], signatureReference: null,
    output: { bucket: VAULT, path: 'assembled/org/a.pdf' },
  }));
  assert.equal(supabase.uploads.length, 0);
});
