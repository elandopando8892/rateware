import { describe, expect, it } from 'vitest';

import { canonicalToSurveyJson, surveyJsonToCanonical } from './surveyjs-canonical-adapter';

const ids = {
  template: '11111111-1111-4111-8111-111111111111',
  version: '22222222-2222-4222-8222-222222222222',
};
const catalog = ['supplier.legalName', 'supplier.address', 'fiscal.taxIdentifier', 'banking.accountNumber'];

function baseSurvey() {
  return {
    title: 'Supplier registration',
    pages: [{
      name: 'page_1',
      elements: [
        { type: 'panel', name: 'company', title: 'Company', ospKind: 'section' },
        { type: 'panel', name: 'instructions', title: 'Instructions', description: 'Use official records.', ospKind: 'instruction' },
        { type: 'text', name: 'legal_name', title: 'Legal name', isRequired: true, ospKind: 'text', ospCanonicalFieldId: 'supplier.legalName', ospAliases: ['Razón social'] },
        { type: 'comment', name: 'address', title: 'Address', ospKind: 'textarea', ospCanonicalFieldId: 'supplier.address' },
        { type: 'text', name: 'email', title: 'Email', inputType: 'email', ospKind: 'email' },
        { type: 'text', name: 'phone', title: 'Phone', inputType: 'tel', ospKind: 'phone' },
        { type: 'text', name: 'date', title: 'Date', inputType: 'date', ospKind: 'date' },
        { type: 'text', name: 'amount', title: 'Amount', inputType: 'number', ospKind: 'number' },
        { type: 'text', name: 'currency', title: 'Currency', inputType: 'number', ospKind: 'currency' },
        { type: 'text', name: 'tax_id', title: 'Tax ID', ospKind: 'canonical_identifier', ospCanonicalFieldId: 'fiscal.taxIdentifier' },
        { type: 'dropdown', name: 'country', title: 'Country', ospKind: 'single_select', choices: [{ value: 'mx', text: 'Mexico' }] },
        { type: 'checkbox', name: 'services', title: 'Services', ospKind: 'multi_select', choices: [{ value: 'ftl', text: 'FTL' }] },
        { type: 'boolean', name: 'approved', title: 'Approved', ospKind: 'yes_no' },
        { type: 'boolean', name: 'certified', title: 'Certified', ospKind: 'checkbox', ospVisibility: { all: [{ fieldId: 'approved', operator: 'equals', value: true }] } },
        { type: 'matrixdynamic', name: 'contacts', title: 'Contacts', ospKind: 'repeating_table', maxRowCount: 10, columns: [{ name: 'name', title: 'Name', cellType: 'text' }] },
        { type: 'boolean', name: 'proof', title: 'Proof of address', ospKind: 'document_request', ospDocumentType: 'proof_of_address' },
        { type: 'text', name: 'display_name', title: 'Display name', readOnly: true, ospKind: 'derived_readonly', ospSourceFieldIds: ['legal_name'], ospOperation: 'copy' },
        { type: 'text', name: 'signature', title: 'Signature position', readOnly: true, ospKind: 'signature_position', ospSignature: { page: 1, anchor: 'SIGN HERE', x: 10, y: 20, width: 100, height: 30 } },
      ],
    }],
  };
}

async function convert(survey: unknown = baseSurvey()) {
  return surveyJsonToCanonical(survey, { templateId: ids.template, versionId: ids.version, version: 1, status: 'draft', canonicalFieldIds: catalog });
}

describe('SurveyJS canonical adapter', () => {
  it('maps every MVP component to one bounded canonical template and round-trips safely', async () => {
    const template = await convert();
    expect(template.fields).toHaveLength(18);
    expect(template.fields.map((field) => field.definition.kind)).toEqual([
      'section', 'instruction', 'text', 'textarea', 'email', 'phone', 'date', 'number', 'currency', 'canonical_identifier',
      'single_select', 'multi_select', 'yes_no', 'checkbox', 'repeating_table', 'document_request', 'derived_readonly', 'signature_position',
    ]);
    expect(template.schemaSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await convert(canonicalToSurveyJson(template))).toEqual(template);
  });

  it.each([
    ['HTML', () => ({ ...baseSurvey(), title: '<b>unsafe</b>' })],
    ['URL', () => ({ ...baseSurvey(), title: 'https://unsafe.example.test' })],
    ['file', () => ({ ...baseSurvey(), pages: [{ name: 'page_1', elements: [{ type: 'file', name: 'upload', title: 'Upload', ospKind: 'text' }] }] })],
    ['expression', () => ({ ...baseSurvey(), pages: [{ name: 'page_1', elements: [{ type: 'text', name: 'unsafe', title: 'Unsafe', ospKind: 'text', visibleIf: '{x}=1' }] }] })],
    ['unknown property', () => ({ ...baseSurvey(), pages: [{ name: 'page_1', elements: [{ type: 'text', name: 'unsafe', title: 'Unsafe', ospKind: 'text', surprise: true }] }] })],
    ['protected default', () => ({ ...baseSurvey(), pages: [{ name: 'page_1', elements: [{ type: 'text', name: 'tax_id', title: 'Tax', ospKind: 'canonical_identifier', ospCanonicalFieldId: 'fiscal.taxIdentifier', defaultValue: 'hidden' }] }] })],
    ['unknown canonical field', () => ({ ...baseSurvey(), pages: [{ name: 'page_1', elements: [{ type: 'text', name: 'unknown', title: 'Unknown', ospKind: 'text', ospCanonicalFieldId: 'supplier.unknown' }] }] })],
    ['later rule', () => ({ ...baseSurvey(), pages: [{ name: 'page_1', elements: [{ type: 'text', name: 'first', title: 'First', ospKind: 'text', ospVisibility: { all: [{ fieldId: 'later', operator: 'is_present' }] } }, { type: 'text', name: 'later', title: 'Later', ospKind: 'text' }] }] })],
    ['too many fields', () => ({ title: 'Large', pages: [{ name: 'page_1', elements: Array.from({ length: 201 }, (_, index) => ({ type: 'text', name: `field_${index}`, title: `Field ${index}`, ospKind: 'text' })) }] })],
    ['too many columns', () => ({ title: 'Wide', pages: [{ name: 'page_1', elements: [{ type: 'matrixdynamic', name: 'wide', title: 'Wide', ospKind: 'repeating_table', maxRowCount: 10, columns: Array.from({ length: 21 }, (_, index) => ({ name: `column_${index}`, title: `Column ${index}`, cellType: 'text' })) }] }] })],
  ])('rejects %s instead of persisting untrusted SurveyJS JSON', async (_label, input) => {
    await expect(convert(input())).rejects.toThrow(/FORM_SCHEMA_INVALID|FORM_RULE_INVALID|FORM_CANONICAL_FIELD_INVALID|FORM_LIMIT_EXCEEDED/);
  });
});
