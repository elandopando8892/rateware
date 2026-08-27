import { describe, expect, it } from 'vitest';

import type { FormTemplateVersion } from './surveyjs-canonical-adapter';
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
