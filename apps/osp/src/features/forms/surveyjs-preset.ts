import { Serializer, setLicenseKey } from 'survey-core';
import { SurveyCreator } from 'survey-creator-react';

export type SurveyLicenseEvidence = { approved: boolean; licenseKey: string };

export const SURVEYJS_ALLOWED_PROPERTIES = Object.freeze([
  'name', 'title', 'description', 'isRequired', 'inputType', 'minLength', 'maxLength', 'min', 'max', 'choices',
  'columns', 'maxRowCount', 'readOnly', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospDocumentType',
  'ospSourceFieldIds', 'ospOperation', 'ospSignature', 'ospVisibility',
]);

export const SURVEYJS_ALLOWED_TOOLBOX = Object.freeze([
  { name: 'osp_section', title: 'Section', json: { type: 'panel', name: 'section', title: 'Section', ospKind: 'section' } },
  { name: 'osp_instruction', title: 'Instruction', json: { type: 'panel', name: 'instruction', title: 'Instruction', description: 'Instruction', ospKind: 'instruction' } },
  { name: 'osp_text', title: 'Single line', json: { type: 'text', name: 'text', title: 'Text', ospKind: 'text' } },
  { name: 'osp_textarea', title: 'Multiline', json: { type: 'comment', name: 'textarea', title: 'Multiline', ospKind: 'textarea' } },
  { name: 'osp_email', title: 'Email', json: { type: 'text', name: 'email', title: 'Email', inputType: 'email', ospKind: 'email' } },
  { name: 'osp_phone', title: 'Phone', json: { type: 'text', name: 'phone', title: 'Phone', inputType: 'tel', ospKind: 'phone' } },
  { name: 'osp_date', title: 'Date', json: { type: 'text', name: 'date', title: 'Date', inputType: 'date', ospKind: 'date' } },
  { name: 'osp_number', title: 'Number', json: { type: 'text', name: 'number', title: 'Number', inputType: 'number', ospKind: 'number' } },
  { name: 'osp_currency', title: 'Currency', json: { type: 'text', name: 'currency', title: 'Currency', inputType: 'number', ospKind: 'currency' } },
  { name: 'osp_identifier', title: 'Canonical identifier', json: { type: 'text', name: 'identifier', title: 'Identifier', ospKind: 'canonical_identifier' } },
  { name: 'osp_single_select', title: 'Single select', json: { type: 'dropdown', name: 'single_select', title: 'Single select', ospKind: 'single_select', choices: [{ value: 'option', text: 'Option' }] } },
  { name: 'osp_multi_select', title: 'Multi select', json: { type: 'checkbox', name: 'multi_select', title: 'Multi select', ospKind: 'multi_select', choices: [{ value: 'option', text: 'Option' }] } },
  { name: 'osp_yes_no', title: 'Yes or no', json: { type: 'boolean', name: 'yes_no', title: 'Yes or no', ospKind: 'yes_no' } },
  { name: 'osp_checkbox', title: 'Checkbox', json: { type: 'boolean', name: 'checkbox', title: 'Checkbox', ospKind: 'checkbox' } },
  { name: 'osp_table', title: 'Repeating table', json: { type: 'matrixdynamic', name: 'table', title: 'Repeating table', ospKind: 'repeating_table', maxRowCount: 20, columns: [{ name: 'value', title: 'Value', cellType: 'text' }] } },
  { name: 'osp_document', title: 'Document request', json: { type: 'boolean', name: 'document', title: 'Document request', ospKind: 'document_request', ospDocumentType: 'proof_of_address' } },
  { name: 'osp_derived', title: 'Derived read-only', json: { type: 'text', name: 'derived', title: 'Derived value', readOnly: true, ospKind: 'derived_readonly', ospSourceFieldIds: ['source'], ospOperation: 'copy' } },
  { name: 'osp_signature_position', title: 'Signature position', json: { type: 'text', name: 'signature_position', title: 'Signature position', readOnly: true, ospKind: 'signature_position', ospSignature: { page: 1, anchor: 'SIGN HERE', x: 0, y: 0, width: 100, height: 30 } } },
]);

let metadataRegistered = false;
function registerMetadata() {
  if (metadataRegistered) return;
  metadataRegistered = true;
  for (const className of ['question', 'panel']) {
    for (const property of ['ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospDocumentType', 'ospSourceFieldIds', 'ospOperation', 'ospSignature', 'ospVisibility']) {
      if (!Serializer.findProperty(className, property)) Serializer.addProperty(className, { name: property, type: 'object' });
    }
  }
}

export function createRestrictedSurveyCreator(license: SurveyLicenseEvidence): SurveyCreator {
  if (license.approved !== true || typeof license.licenseKey !== 'string' || license.licenseKey.trim() !== license.licenseKey || license.licenseKey.length < 1 || license.licenseKey.length > 8_192) throw new Error('SURVEYJS_LICENSE_REQUIRED');
  setLicenseKey(license.licenseKey);
  registerMetadata();
  const creator = new SurveyCreator({
    showJSONEditorTab: false,
    showLogicTab: false,
    showThemeTab: false,
    showTranslationTab: false,
    showPreviewTab: true,
    showToolbox: true,
    isAutoSave: false,
  });
  creator.toolbox.clearItems();
  creator.toolbox.addItems(SURVEYJS_ALLOWED_TOOLBOX.map((item) => ({ ...item })), false);
  const allowed = new Set<string>(SURVEYJS_ALLOWED_PROPERTIES);
  creator.onPropertyShowing.add((_sender, event) => { event.show = allowed.has(event.property.name); });
  return creator;
}
