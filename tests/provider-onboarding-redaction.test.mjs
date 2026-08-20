import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// "redacted" was an access gate that redacted nothing: a package item approved at
// disclosure_mode 'redacted' passed the gate and then had its FULL value written into
// the assembled document, because every transform preserved the value. The approver was
// told one thing and the document carried another.
const assembly = readFileSync(
  new URL('../supabase/functions/_shared/provider-onboarding-form-assembly.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20260820050000_provider_onboarding_redacting_transforms.sql', import.meta.url),
  'utf8',
);

const MASK = '•';
const VALUE_PRESERVING = ['direct', 'uppercase', 'lowercase', 'date_iso', 'boolean_yes_no'];

/** The transform function as the module ships it, extracted so it can be executed. */
function transform(value, code) {
  if (code === 'uppercase') return String(value).toUpperCase();
  if (code === 'lowercase') return String(value).toLowerCase();
  if (code === 'date_iso') {
    const date = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Mapped date is not ISO.');
    return date;
  }
  if (code === 'boolean_yes_no') return value === true ? 'Yes' : value === false ? 'No' : String(value);
  if (code === 'mask_all') return MASK.repeat(Math.min(String(value ?? '').length, 32));
  if (code === 'mask_all_but_last4') {
    const text = String(value ?? '');
    if (text.length < 5) return MASK.repeat(text.length);
    return MASK.repeat(text.length - 4) + text.slice(-4);
  }
  return value;
}

test('the extracted transform matches the one the module ships', () => {
  // If the module's masking changes, these executed assertions stop describing it.
  assert.match(assembly, /if\(code==='mask_all'\) return '.'\.repeat\(Math\.min\(String\(value\?\?''\)\.length,32\)\);/);
  assert.match(assembly, /if\(text\.length<5\) return '.'\.repeat\(text\.length\);/);
  assert.match(assembly, /return '.'\.repeat\(text\.length-4\)\+text\.slice\(-4\);/);
  // The masking character in the module is U+2022, the one used here.
  assert.ok(assembly.includes(`'${MASK}'`), 'the module must mask with U+2022');
});

test('a redacted item cannot be written in full', () => {
  // The security property. Without it the RFC would land on an outbound form at full
  // value under a package the approver saw labelled "redacted".
  assert.match(assembly, /packageItem\.disclosure_mode==='redacted'&&!REDACTING_TRANSFORMS\.has\(mapping\.transform_code\)/);
  assert.match(assembly, /would write a redacted item in full/);
});

test('only the masking transforms count as redacting', () => {
  assert.match(assembly, /const REDACTING_TRANSFORMS=new Set\(\['mask_all','mask_all_but_last4'\]\);/);
  const declared = assembly.match(/const REDACTING_TRANSFORMS=new Set\(\[([^\]]*)\]\);/)[1];
  // Each transform gets an input it accepts -- date_iso rejects anything that is not a
  // date -- and each must hand the value straight back.
  const sample = { direct: 'XSL260511N11', uppercase: 'XSL260511N11', lowercase: 'XSL260511N11', date_iso: '2026-05-11', boolean_yes_no: 'XSL260511N11' };
  for (const code of VALUE_PRESERVING) {
    const input = sample[code];
    const output = String(transform(input, code));
    // Executed: each of these genuinely preserves the value, so none may be listed.
    assert.equal(output.toUpperCase(), input.toUpperCase(), `${code} should preserve the value`);
    assert.ok(!output.includes(MASK), `${code} must not mask`);
    assert.ok(!declared.includes(`'${code}'`), `${code} preserves the value and must not be a redacting transform`);
  }
});

test('mask_all_but_last4 leaves exactly four characters', () => {
  const masked = transform('XSL260511N11', 'mask_all_but_last4');
  assert.equal(masked, `${MASK.repeat(8)}1N11`);
  assert.equal(masked.length, 'XSL260511N11'.length, 'length is preserved so field widths still line up');
  assert.ok(!masked.includes('XSL'), 'the leading characters must not survive');
});

test('a short value is fully masked rather than mostly revealed', () => {
  // "AB12" with the last four kept would be the whole string. Partial masking below
  // five characters is not masking.
  for (const short of ['', 'A', 'AB', 'AB1', 'AB12']) {
    assert.equal(transform(short, 'mask_all_but_last4'), MASK.repeat(short.length));
  }
  // Five is the first length where four survivors still hide something.
  assert.equal(transform('AB123', 'mask_all_but_last4'), `${MASK}B123`);
});

test('mask_all reveals nothing and is bounded', () => {
  assert.equal(transform('XSL260511N11', 'mask_all'), MASK.repeat(12));
  assert.equal(transform(null, 'mask_all'), '');
  // A very long value must not produce an unbounded run of dots in a form field.
  assert.equal(transform('x'.repeat(500), 'mask_all').length, 32);
});

test('the masking transforms are accepted by the table constraint', () => {
  assert.match(migration, /'mask_all','mask_all_but_last4'\)/);
  for (const code of VALUE_PRESERVING.filter((item) => item !== 'direct')) {
    assert.ok(migration.includes(`'${code}'`), `the constraint dropped ${code}`);
  }
});

test('the migration says why the pairing exists', () => {
  // The next person needs to know that redacted-means-nothing was the bug.
  assert.match(migration, /access gate that never redacted/i);
});
