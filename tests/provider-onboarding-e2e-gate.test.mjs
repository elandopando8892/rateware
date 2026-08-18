import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { resolveXbfEntity, scoreProviderMatch } from '../supabase/functions/_shared/provider-agent-resolution.mjs';
import { classifyOnboardingRequest } from '../supabase/functions/_shared/provider-agent-classifier.mjs';
import { extractAndMapForm } from '../supabase/functions/_shared/provider-onboarding-form-extraction.mjs';
import { assembleFormDocument, describeArtifact } from '../supabase/functions/_shared/provider-onboarding-form-adapters.mjs';
import { createProviderOnboardingAssembler } from '../supabase/functions/_shared/provider-onboarding-assembler.mjs';
import { planEntityVaultImport } from '../supabase/functions/_shared/provider-entity-import.mjs';

// Synthetic end-to-end release gate — brief §18 Phase 9.
//
// Chains the real modules in the real order and asserts each stage's outcome. This is
// the gate that would have caught the orphaned-module defect: a stage whose module is
// unreachable cannot produce its output here.
//
// Every fixture is synthetic. No real provider, mailbox, identifier, document or
// signature appears anywhere in this file.

const VAULT = 'provider-entity-vault';
const ORG = '11111111-1111-4111-8111-111111111111';

const INBOUND = {
  from_email: 'ap@synthetic-carrier.invalid',
  sender_name: 'Synthetic Carrier LLC',
  subject: 'New customer setup - please complete attached packet',
  body_text: 'Please complete the attached vendor packet and return it with your W-9 and EIN letter. Our MC# 123456 is on file.',
  attachment_names: ['vendor packet.pdf'],
};

const RELATIONSHIPS = [{
  id: 'rel-1', vendor_id: 'vendor-1', legal_entity_id: 'ent-us',
  display_name: 'Synthetic Carrier LLC',
  contact_emails: ['ap@synthetic-carrier.invalid'],
  domains: ['synthetic-carrier.invalid'], mc_numbers: ['123456'], dot_numbers: [],
}];

// Reviewed canonical facts, as Sprint 2 will produce them once the corpus is mounted.
const FACTS = {
  legal_name: { value: 'XBFREIGHT SYSTEMS LLC', evidence_document_id: 'doc-articles' },
  ein: { value: 'SYNTHETIC-EIN', evidence_document_id: 'doc-ein' },
};

async function packet() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 500]);
  const form = pdf.getForm();
  form.createTextField('Legal Name').addToPage(page, { x: 50, y: 420, width: 300, height: 20 });
  form.createTextField('Federal Tax ID').addToPage(page, { x: 50, y: 380, width: 300, height: 20 });
  form.createTextField('Requested Credit Line').addToPage(page, { x: 50, y: 300, width: 300, height: 20 });
  return new Uint8Array(await pdf.save());
}

function storageStub(bytes, uploads) {
  return {
    storage: {
      from: () => ({
        download: async () => ({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), error: null }),
        upload: async (path, body, options) => { uploads.push({ path, body, options }); return { data: { path }, error: null }; },
      }),
    },
    from: () => {
      const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: null, error: null }) };
      return builder;
    },
  };
}

const stubClassifier = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify({
      request_type: 'customer_setup', confidence: 0.93, language: 'en',
      requested_documents: ['W-9', 'EIN letter'], forms_to_complete: ['vendor packet'],
      deadline_text: null, reasoning: 'Sender asks XBF to complete their packet.',
    }) } }],
  }),
});

test('E2E: inbound request to a filled, privately stored packet', async (t) => {
  const stages = [];

  // 1 — classify the request
  const classification = await classifyOnboardingRequest(INBOUND, { openaiApiKey: 'k', fetch: stubClassifier });
  assert.equal(classification.request_type, 'customer_setup');
  assert.equal(classification.decision, 'proposed', 'the model proposes, never decides');
  stages.push(`classify=${classification.request_type}`);

  // 2 — match the provider
  const match = scoreProviderMatch(INBOUND, RELATIONSHIPS);
  assert.equal(match.decision, 'matched');
  assert.equal(match.auto_link.provider_relationship_id, 'rel-1');
  stages.push(`match=${match.auto_link.match_basis}`);

  // 3 — resolve the XBF legal entity
  const entity = resolveXbfEntity(INBOUND);
  assert.equal(entity.entity_kind, 'us', 'W-9 and EIN are US-only evidence');
  assert.equal(entity.requires_human_selection, false);
  stages.push(`entity=${entity.entity_kind}`);

  // 4 — ingest the attachment
  const bytes = await packet();
  const plan = await planEntityVaultImport([{ filename: 'vendor packet.pdf', bytes }]);
  assert.equal(plan.plans.length, 1);
  assert.equal(plan.plans[0].queue_review, true);
  stages.push(`ingest=${plan.plans[0].sensitivity}`);

  // 5 — extract the questions and map them against reviewed facts
  const mapped = await extractAndMapForm({ format: 'pdf', bytes, facts: FACTS });
  assert.equal(mapped.summary.total, 3);
  assert.equal(mapped.rows.find((row) => row.field_code === 'legal_name').status, 'proposed');
  const credit = mapped.rows.find((row) => row.field_code === 'credit_requested');
  assert.equal(credit.status, 'pending', 'credit is never inferred and has no fact');
  assert.equal(credit.proposed_value, null);
  stages.push(`extract=${mapped.summary.proposed}p/${mapped.summary.pending}pending`);

  // 6 — fill only what review approved; a pending field stays empty
  const approved = Object.fromEntries(mapped.rows
    .filter((row) => row.status === 'proposed')
    .map((row) => [row.target, row.proposed_value]));
  const filled = await assembleFormDocument({ format: 'pdf', templateBytes: bytes, fields: approved });
  assert.deepEqual([...filled.filled_fields].sort(), ['Federal Tax ID', 'Legal Name'],
    'both reviewed facts fill; nothing without a fact does');
  const reloaded = (await PDFDocument.load(filled.bytes)).getForm();
  assert.equal(reloaded.getTextField('Legal Name').getText(), 'XBFREIGHT SYSTEMS LLC');
  assert.equal(reloaded.getTextField('Federal Tax ID').getText(), 'SYNTHETIC-EIN');
  assert.equal(reloaded.getTextField('Requested Credit Line').getText(), undefined, 'a pending field is never guessed');
  stages.push(`fill=${filled.fidelity}`);

  // 7 — private assembly, template integrity enforced
  const { sha256 } = await describeArtifact(bytes);
  const uploads = [];
  const assembler = createProviderOnboardingAssembler(storageStub(bytes, uploads));
  const artifact = await assembler.assembleAndStore({
    template: { bucket: VAULT, path: 'templates/packet.pdf', sha256 },
    fields: approved, documentReferences: [], signatureReference: null,
    output: { bucket: VAULT, path: `assembled/${ORG}/a.pdf` },
  });
  assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
  assert.equal(uploads[0].options.upsert, false, 'an artifact can never overwrite another');
  stages.push(`assemble=${artifact.sha256.slice(0, 8)}`);

  t.diagnostic(stages.join(' | '));
  assert.equal(stages.length, 7, 'every stage produced an outcome');
});

test('E2E: a tampered template stops the chain before anything is stored', async () => {
  const bytes = await packet();
  const uploads = [];
  const assembler = createProviderOnboardingAssembler(storageStub(bytes, uploads));
  await assert.rejects(assembler.assembleAndStore({
    template: { bucket: VAULT, path: 'templates/packet.pdf', sha256: 'f'.repeat(64) },
    fields: {}, documentReferences: [], signatureReference: null,
    output: { bucket: VAULT, path: 'assembled/x.pdf' },
  }), /template changed after approval/);
  assert.equal(uploads.length, 0, 'nothing is stored when the authorization is invalid');
});

test('E2E: ambiguous jurisdiction halts at the entity gate, not later', () => {
  const entity = resolveXbfEntity({
    ...INBOUND,
    body_text: 'Send your W-9 (US) or RFC and CSF if you are the Mexican entity.',
  });
  assert.equal(entity.decision, 'ambiguous');
  assert.equal(entity.entity_kind, null);
  assert.equal(entity.requires_human_selection, true, 'a human picks the entity; the chain does not proceed');
});

test('E2E: an unknown sender reaches review instead of creating a provider', () => {
  const match = scoreProviderMatch({
    ...INBOUND, from_email: 'someone@gmail.com', sender_name: 'Unrelated Co',
    body_text: 'Please set us up as a vendor.',
  }, RELATIONSHIPS);
  assert.equal(match.decision, 'unmatched');
  assert.equal(match.auto_link, null);
  assert.equal(match.sender_domain_generic, true);
});

test('E2E: an empty vault yields a packet with nothing invented', async () => {
  // The honest state until the corpus is mounted: every field pending, none guessed.
  const bytes = await packet();
  const mapped = await extractAndMapForm({ format: 'pdf', bytes, facts: {} });
  assert.equal(mapped.summary.proposed, 0);
  assert.equal(mapped.summary.pending, mapped.summary.total);
  const filled = await assembleFormDocument({ format: 'pdf', templateBytes: bytes, fields: {} });
  assert.deepEqual(filled.filled_fields, []);
});

test('E2E: every stage module is reachable from this gate', () => {
  // A module nothing imports cannot fail a test that never calls it. This gate calls
  // each one directly, so an unreachable stage breaks the build.
  for (const fn of [
    scoreProviderMatch, resolveXbfEntity, classifyOnboardingRequest, extractAndMapForm,
    assembleFormDocument, createProviderOnboardingAssembler, planEntityVaultImport,
  ]) {
    assert.equal(typeof fn, 'function');
  }
});
