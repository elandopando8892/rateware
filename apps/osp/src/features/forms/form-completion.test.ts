import { describe, expect, it } from 'vitest';

import type { FormComponent, FormTemplateVersion } from './surveyjs-canonical-adapter';
import { assessFormCompletion } from './form-completion';

const template: FormTemplateVersion = {
  id: '72111111-1111-4111-8111-111111111111',
  templateId: '71111111-1111-4111-8111-111111111111',
  version: 1,
  status: 'published',
  schemaSha256: 'a'.repeat(64),
  fields: [
    { id: 'legal_name', label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: [], visibility: null, definition: { kind: 'text', minLength: 2, maxLength: 256 } },
    { id: 'tax_identifier', label: 'Tax identifier', required: true, canonicalFieldId: 'fiscal.taxIdentifier', supplierAliases: [], visibility: null, definition: { kind: 'canonical_identifier', minLength: 8, maxLength: 32 } },
    { id: 'bank_account', label: 'Bank account', required: true, canonicalFieldId: 'banking.accountNumber', supplierAliases: [], visibility: { all: [{ fieldId: 'needs_bank', operator: 'equals', value: true }] }, definition: { kind: 'text', minLength: 4, maxLength: 34 } },
  ],
};

describe('assessFormCompletion', () => {
  const references: FormComponent = { id: 'references', label: 'Commercial references', required: true, canonicalFieldId: null, supplierAliases: [], visibility: null, definition: { kind: 'repeating_table', minRows: 3, maxRows: 4, uniqueBy: 'company', columns: [
    { id: 'company', label: 'Company', valueType: 'text', required: true },
    { id: 'contact', label: 'Contact', valueType: 'text', required: true },
    { id: 'phone', label: 'Phone', valueType: 'phone', required: true },
    { id: 'email', label: 'Email', valueType: 'email', required: true },
  ] } };
  const completeReferences = ['A', 'B', 'C'].map((company) => ({ company, contact: 'Test contact', phone: '+52 81 1234 5678', email: `${company}@example.test` }));

  it('requires three distinct complete references and explains missing cells without exposing their values', () => {
    expect(assessFormCompletion({ fields: [references] }, { references: completeReferences.slice(0, 2) }).issues[0].details).toContain('At least 3 rows required; 2 provided.');
    const missing = assessFormCompletion({ fields: [references] }, { references: completeReferences.map((row) => ({ ...row, email: '' })) });
    expect(missing.ready).toBe(false);
    expect(missing.issues[0].details).toEqual([1, 2, 3].map((row) => `Row ${row}: Email is required.`));
    expect(assessFormCompletion({ fields: [references] }, { references: [...completeReferences.slice(0, 2), { ...completeReferences[0], company: ' a ' }] }).issues[0].details).toContain('Row 3: duplicate Company.');
    expect(assessFormCompletion({ fields: [references] }, { references: completeReferences })).toMatchObject({ ready: true, progress: 100 });
  });

  it.each(['email', 'phone'])('blocks invalid reference %s while allowing an empty optional table', (column) => {
    expect(assessFormCompletion({ fields: [references] }, { references: completeReferences.map((row) => ({ ...row, [column]: 'N/A' })) }).ready).toBe(false);
    expect(assessFormCompletion({ fields: [{ ...references, required: false }] }, {}).issues).toEqual([]);
  });

  const field = (kind: 'yes_no' | 'checkbox'): FormComponent => ({ id: 'security', label: 'Security answer', required: true, canonicalFieldId: null, supplierAliases: [], visibility: null, definition: { kind } });

  it('accepts an explicit No but still requires consent for a required checkbox', () => {
    expect(assessFormCompletion({ fields: [field('yes_no')] }, { security: false })).toMatchObject({ ready: true, progress: 100 });
    expect(assessFormCompletion({ fields: [field('yes_no')] }, {})).toMatchObject({ ready: false, progress: 0 });
    expect(assessFormCompletion({ fields: [field('checkbox')] }, { security: false }).issues[0].code).toBe('missing');
    expect(assessFormCompletion({ fields: [field('checkbox')] }, { security: true }).ready).toBe(true);
  });

  it('treats No as present in visibility rules and reports conditional exclusions separately', () => {
    const followup: FormComponent = { ...template.fields[0], visibility: { all: [{ fieldId: 'security', operator: 'is_present' }] } };
    expect(assessFormCompletion({ fields: [field('yes_no'), followup] }, { security: false })).toMatchObject({ required: 2, completed: 1, conditionalExclusions: [] });
    expect(assessFormCompletion({ fields: [followup] }, {})).toMatchObject({ required: 0, conditionalExclusions: [{ fieldId: 'legal_name', label: 'Legal name' }] });
    const whenBlank = { ...followup, visibility: { all: [{ fieldId: 'security', operator: 'is_blank' as const }] } };
    expect(assessFormCompletion({ fields: [whenBlank] }, { security: false }).required).toBe(0);
  });

  const table: FormComponent = { ...field('yes_no'), id: 'references', definition: { kind: 'repeating_table', columns: [{ id: 'name', label: 'Name', valueType: 'text' }, { id: 'years', label: 'Years', valueType: 'number' }], maxRows: 4 } };
  it.each([{ rows: [] }, { rows: [{}] }, { rows: [{ name: ' ' }] }])('does not count empty reference rows as completion: $rows', ({ rows }) => {
    expect(assessFormCompletion({ fields: [table] }, { references: rows })).toMatchObject({ ready: false, progress: 0 });
  });

  it('rejects blank extra rows and unknown columns, while preserving numeric zero', () => {
    expect(assessFormCompletion({ fields: [table] }, { references: [{ name: 'Example' }, {}] }).ready).toBe(false);
    expect(assessFormCompletion({ fields: [table] }, { references: [{ invented: 'Example' }] }).ready).toBe(false);
    expect(assessFormCompletion({ fields: [table] }, { references: [{ years: 0 }] }).ready).toBe(true);
  });
  it('tracks visible required fields and rejects invalid values', () => {
    expect(assessFormCompletion(template, { legal_name: 'X', tax_identifier: 'XAXX010101000', needs_bank: false })).toMatchObject({ required: 2, completed: 1, progress: 50, ready: false });
    expect(assessFormCompletion(template, { legal_name: 'Sierra Retail', tax_identifier: 'XAXX010101000', needs_bank: true, bank_account: '1234' })).toMatchObject({ required: 3, completed: 3, progress: 100, ready: true });
  });

  it('blocks an invalid optional value without reducing required-field progress', () => {
    const optionalEmail = { id: 'contact_email', label: 'Contact email', required: false, canonicalFieldId: 'supplier.contactEmail', supplierAliases: [], visibility: null, definition: { kind: 'email' as const, minLength: 3, maxLength: 100 } };
    const result = assessFormCompletion({ fields: [...template.fields, optionalEmail] }, { legal_name: 'Sierra Retail', tax_identifier: 'XAXX010101000', needs_bank: false, contact_email: 'not-an-email' });
    expect(result).toMatchObject({ completed: 2, progress: 100, ready: false });
    expect(result.issues).toEqual([{ fieldId: 'contact_email', label: 'Contact email', code: 'invalid' }]);
  });
});
