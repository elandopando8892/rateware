import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_LINK_THRESHOLD, emailDomain, extractCarrierIdentifiers, isGenericDomain,
  normalizeCompanyName, resolveXbfEntity, scoreProviderMatch,
} from '../supabase/functions/_shared/provider-agent-resolution.mjs';

// All fixtures are synthetic. No real provider, address, identifier or mailbox appears.
const RELATIONSHIPS = [
  {
    id: 'rel-1', legal_entity_id: 'ent-1', display_name: 'Synthetic Carrier LLC',
    contact_emails: ['ap@synthetic-carrier.invalid'], domains: ['synthetic-carrier.invalid'],
    mc_numbers: ['123456'], dot_numbers: ['7654321'],
  },
  {
    id: 'rel-2', legal_entity_id: 'ent-1', display_name: 'Otra Transportista S. de R.L. de C.V.',
    contact_emails: ['cxp@otra-transportista.invalid'], domains: ['otra-transportista.invalid'],
    mc_numbers: [], dot_numbers: [],
  },
];

test('an exact contact email matches with full confidence and auto-links', () => {
  const result = scoreProviderMatch({ from_email: 'AP@Synthetic-Carrier.invalid' }, RELATIONSHIPS);
  assert.equal(result.decision, 'matched');
  assert.equal(result.auto_link.provider_relationship_id, 'rel-1');
  assert.equal(result.auto_link.match_basis, 'contact_email');
  assert.equal(result.auto_link.confidence, 1);
});

test('a known sender domain auto-links at the threshold', () => {
  const result = scoreProviderMatch({ from_email: 'someone.new@synthetic-carrier.invalid' }, RELATIONSHIPS);
  assert.equal(result.decision, 'matched');
  assert.equal(result.auto_link.match_basis, 'sender_domain');
  assert.ok(result.auto_link.confidence >= AUTO_LINK_THRESHOLD);
});

test('a consumer mailbox domain never matches a provider by domain', () => {
  // Otherwise every provider using gmail matches whichever relationship listed it.
  const relationships = [{ ...RELATIONSHIPS[0], domains: ['gmail.com'] }];
  const result = scoreProviderMatch({ from_email: 'someone@gmail.com' }, relationships);
  assert.equal(result.decision, 'unmatched');
  assert.equal(result.sender_domain_generic, true);
  assert.equal(result.candidates.length, 0);
  assert.ok(isGenericDomain('gmail.com'));
  assert.ok(!isGenericDomain('synthetic-carrier.invalid'));
});

test('an MC or DOT number in the body identifies the provider', () => {
  const byMc = scoreProviderMatch({ from_email: 'x@unknown.invalid', body_text: 'Our MC# 123456 is active.' }, RELATIONSHIPS);
  assert.equal(byMc.auto_link.match_basis, 'carrier_identifier');
  assert.deepEqual(byMc.auto_link.evidence, { mc_number: '123456' });

  const byDot = scoreProviderMatch({ from_email: 'x@unknown.invalid', body_text: 'USDOT 7654321' }, RELATIONSHIPS);
  assert.equal(byDot.auto_link.match_basis, 'carrier_identifier');
});

test('carrier identifiers are extracted in several written forms', () => {
  const result = extractCarrierIdentifiers('MC-123456 and MC # 999888, USDOT7654321, DOT 1234567');
  assert.deepEqual([...result.mc_numbers].sort(), ['123456', '999888']);
  assert.deepEqual([...result.dot_numbers].sort(), ['1234567', '7654321']);
});

test('a name-only match is proposed for review, never auto-linked', () => {
  const result = scoreProviderMatch(
    { from_email: 'contact@some-other-domain.invalid', sender_name: 'Synthetic Carrier, LLC.' },
    RELATIONSHIPS,
  );
  assert.equal(result.decision, 'needs_review');
  assert.equal(result.reason, 'confidence_below_auto_link_threshold');
  assert.equal(result.auto_link, null);
  assert.equal(result.candidates[0].match_basis, 'normalized_name');
});

test('two relationships tying at the top are ambiguous, never auto-linked', () => {
  // PROVIDER_AGENT_ACTION_POLICY forbids creating a provider from an ambiguous match;
  // that is only enforceable if ambiguity is detected rather than broken by sort order.
  const relationships = [
    { ...RELATIONSHIPS[0], id: 'rel-a', contact_emails: ['shared@carrier.invalid'] },
    { ...RELATIONSHIPS[0], id: 'rel-b', contact_emails: ['shared@carrier.invalid'] },
  ];
  const result = scoreProviderMatch({ from_email: 'shared@carrier.invalid' }, relationships);
  assert.equal(result.decision, 'ambiguous');
  assert.equal(result.reason, 'multiple_candidates_at_equal_confidence');
  assert.equal(result.auto_link, null);
});

test('company name normalization ignores case, accents and legal suffixes', () => {
  assert.equal(normalizeCompanyName('Otra Transportista S. de R.L. de C.V.'), 'otra transportista');
  assert.equal(normalizeCompanyName('Synthetic Carrier, LLC.'), 'synthetic carrier');
  assert.equal(normalizeCompanyName('LOGÍSTICA ÁGIL S.A. de C.V.'), 'logistica agil');
});

test('an unknown sender yields no candidates rather than a guess', () => {
  const result = scoreProviderMatch({ from_email: 'nobody@nowhere.invalid', body_text: 'hello' }, RELATIONSHIPS);
  assert.equal(result.decision, 'unmatched');
  assert.equal(result.candidates.length, 0);
});

test('malformed input degrades to unmatched rather than throwing', () => {
  assert.equal(scoreProviderMatch(null, null).decision, 'unmatched');
  assert.equal(emailDomain('not-an-email'), null);
});

// --- entity resolution -----------------------------------------------------

test('an explicit instruction resolves the entity outright', () => {
  const result = resolveXbfEntity({ explicit_entity_kind: 'MX', body_text: 'W-9 and EIN please' });
  assert.equal(result.entity_kind, 'mx');
  assert.equal(result.basis, 'explicit_instruction');
  assert.equal(result.requires_human_selection, false);
});

test('US-only evidence resolves to the US entity', () => {
  const result = resolveXbfEntity({ subject: 'Vendor setup', body_text: 'Please send your W-9 and EIN letter.' });
  assert.equal(result.entity_kind, 'us');
  assert.equal(result.decision, 'resolved');
  assert.ok(result.us_signals.includes('w9_reference'));
  assert.ok(result.us_signals.includes('ein_reference'));
  assert.deepEqual(result.mx_signals, []);
});

test('MX-only evidence resolves to the Mexican entity', () => {
  const result = resolveXbfEntity({ body_text: 'Favor de enviar su Constancia de Situación Fiscal y RFC.' });
  assert.equal(result.entity_kind, 'mx');
  assert.ok(result.mx_signals.includes('csf_reference'));
  assert.ok(result.mx_signals.includes('rfc_reference'));
});

test('conflicting jurisdiction evidence is never resolved silently', () => {
  // A bilingual packet may cite both; §4 requires a review task, not a coin flip.
  const result = resolveXbfEntity({ body_text: 'Send W-9 (US) or RFC / CSF if Mexican entity.' });
  assert.equal(result.decision, 'ambiguous');
  assert.equal(result.basis, 'conflicting_jurisdiction_evidence');
  assert.equal(result.entity_kind, null);
  assert.equal(result.requires_human_selection, true);
});

test('no jurisdiction evidence is ambiguous, not a default', () => {
  const result = resolveXbfEntity({ subject: 'New vendor packet', body_text: 'Please complete the attached.' });
  assert.equal(result.decision, 'ambiguous');
  assert.equal(result.basis, 'no_jurisdiction_evidence');
  assert.equal(result.entity_kind, null);
});

test('the relationship\'s existing entity is a proposal requiring review, not a resolution', () => {
  const result = resolveXbfEntity({ body_text: 'Please complete the attached.', relationship_entity_kind: 'us' });
  assert.equal(result.entity_kind, 'us');
  assert.equal(result.decision, 'needs_review');
  assert.equal(result.basis, 'existing_relationship_entity');
  assert.equal(result.requires_human_selection, true);
});

test('attachment names and form titles count as jurisdiction evidence', () => {
  const result = resolveXbfEntity({ attachment_names: ['W-9 request.pdf'], form_title: 'IRS vendor form' });
  assert.equal(result.entity_kind, 'us');
  assert.equal(result.decision, 'resolved');
});
