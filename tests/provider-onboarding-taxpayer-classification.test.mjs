import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VALUE_CLASSIFIED_FIELDS, factSensitivity, rfcKind,
} from '../supabase/functions/_shared/provider-onboarding-taxpayer-classification.mjs';

// The two shapes this exists to tell apart. The collision was found on XBF's own pair
// in the vault; the persona fisica fixture is the SAT's generic RFC rather than that
// real one, because writing a living person's birth date into a test file is the exact
// harm the module under test prevents.
const MORAL = 'XSL260511N11';   // XBF Sistemas Logisticos -- a company RFC, public by design
const FISICA = 'XAXX010101000'; // SAT generic RFC: real shape, belongs to no one

test('a company RFC is recognised as persona moral', () => {
  assert.equal(rfcKind(MORAL), 'moral');
  assert.equal(MORAL.length, 12);
});

test('an individual RFC is recognised as persona fisica', () => {
  assert.equal(rfcKind(FISICA), 'fisica');
  assert.equal(FISICA.length, 13);
});

test('a company RFC is business identification, not personal data', () => {
  const result = factSensitivity('rfc', MORAL, 'restricted');
  assert.equal(result.sensitivity, 'public');
  assert.equal(result.taxpayer_kind, 'moral');
  assert.equal(result.reason, 'rfc_persona_moral');
});

test('an individual RFC stays closed because it carries a birth date', () => {
  // This is the whole point. Opening `rfc` globally would publish the birth date of
  // every persona fisica onboarded.
  const result = factSensitivity('rfc', FISICA, 'restricted');
  assert.equal(result.sensitivity, 'restricted');
  assert.equal(result.taxpayer_kind, 'fisica');
  assert.match(result.reason, /birth_date/);
});

test('the birth date really is recoverable from the individual RFC', () => {
  // Guards the premise rather than the code: if this stops being true the rule above
  // loses its justification and someone should revisit it.
  const digits = FISICA.slice(4, 10);
  assert.equal(digits, '010101');
  assert.equal(`${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`, '01-01-01');
});

test('formatting never changes the classification', () => {
  for (const variant of [' xsl260511n11 ', 'XSL-260511-N11', 'xsl 260511 n11']) {
    assert.equal(rfcKind(variant), 'moral', variant);
    assert.equal(factSensitivity('rfc', variant, 'restricted').sensitivity, 'public', variant);
  }
});

test('an unrecognised taxpayer id stays closed', () => {
  // A US EIN, a truncated value, an empty string. Over-protecting is recoverable;
  // publishing a birth date is not.
  for (const value of ['12-3456789', '', null, undefined, 'NOT AN RFC', 'XSL26051', 'XSLA260511N11X']) {
    const result = factSensitivity('rfc', value, 'restricted');
    assert.equal(result.sensitivity, 'restricted', JSON.stringify(value));
    assert.equal(result.taxpayer_kind, 'unknown');
  }
});

test('tax_id is classified the same way, because it holds the same value', () => {
  assert.ok(VALUE_CLASSIFIED_FIELDS.includes('tax_id'));
  assert.equal(factSensitivity('tax_id', MORAL, 'restricted').sensitivity, 'public');
  assert.equal(factSensitivity('tax_id', FISICA, 'restricted').sensitivity, 'restricted');
});

test('every other field keeps whatever the review assigned it', () => {
  // The classifier must not become a general-purpose sensitivity override.
  for (const [code, given] of [
    ['legal_name', 'confidential'], ['bank_name', 'highly_restricted'],
    ['entity_type', 'public'], ['ein', 'restricted'], ['fiscal_address', 'confidential'],
  ]) {
    const result = factSensitivity(code, 'anything at all', given);
    assert.equal(result.sensitivity, given, code);
    assert.equal(result.reason, 'ontology_default');
    assert.equal(result.taxpayer_kind, null);
  }
});

test('an EIN is not silently treated as an RFC', () => {
  // ein is a separate field code and must not be opened by this rule, even though a
  // company EIN is arguably as public as a company RFC. That is a separate decision.
  assert.ok(!VALUE_CLASSIFIED_FIELDS.includes('ein'));
  assert.equal(factSensitivity('ein', '123456789', 'restricted').sensitivity, 'restricted');
});
