export type RuleCondition = {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_blank' | 'is_present';
  value?: string | number | boolean | readonly string[];
};
export type VisibilityRule = { all: readonly RuleCondition[] };

export type FormComponentKind =
  | 'section' | 'instruction' | 'text' | 'textarea' | 'email' | 'phone' | 'date' | 'number' | 'currency'
  | 'canonical_identifier' | 'single_select' | 'multi_select' | 'yes_no' | 'checkbox' | 'repeating_table'
  | 'document_request' | 'derived_readonly' | 'signature_position';

export type FormComponentDefinition =
  | { kind: 'section' | 'instruction'; text: string }
  | { kind: 'text' | 'textarea' | 'email' | 'phone' | 'canonical_identifier'; minLength: number; maxLength: number }
  | { kind: 'date' | 'number' | 'currency'; minimum: number | null; maximum: number | null }
  | { kind: 'single_select' | 'multi_select'; options: readonly { value: string; label: string }[] }
  | { kind: 'yes_no' | 'checkbox' }
  | { kind: 'repeating_table'; columns: readonly { id: string; label: string; valueType: 'text' | 'number' | 'date' }[]; maxRows: number }
  | { kind: 'document_request'; documentType: string }
  | { kind: 'derived_readonly'; sourceFieldIds: readonly string[]; operation: 'join' | 'sum' | 'copy' }
  | { kind: 'signature_position'; page: number; anchor: string; x: number; y: number; width: number; height: number };

export type FormComponent = {
  id: string;
  label: string;
  required: boolean;
  canonicalFieldId: string | null;
  supplierAliases: readonly string[];
  visibility: VisibilityRule | null;
  definition: FormComponentDefinition;
};

export type FormTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: 'draft' | 'published';
  fields: readonly FormComponent[];
  schemaSha256: string;
};

type ConvertContext = {
  templateId: string;
  versionId: string;
  version: number;
  status: 'draft' | 'published';
  canonicalFieldIds: readonly string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SAFE_CANONICAL = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const MAX_FIELDS = 200;
const MAX_COLUMNS = 20;
const MAX_OPTIONS = 100;
const INT32_MAX = 2_147_483_647;

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = [], code = 'FORM_SCHEMA_INVALID'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) throw new Error(code);
  return record;
}

function safeText(value: unknown, maximum = 2_000): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > maximum ||
    /[<>]|(?:javascript|data):|https?:\/\/|\bon[a-z]+\s*=/i.test(value)) throw new Error('FORM_SCHEMA_INVALID');
  return value;
}

function safeId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error('FORM_SCHEMA_INVALID');
  return value;
}

function safeInteger(value: unknown, minimum: number, maximum: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error('FORM_SCHEMA_INVALID');
  return value as number;
}

function optionalFinite(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('FORM_SCHEMA_INVALID');
  return value;
}

function safeAliases(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error('FORM_SCHEMA_INVALID');
  const aliases = value.map((item) => safeText(item, 128));
  if (new Set(aliases).size !== aliases.length) throw new Error('FORM_SCHEMA_INVALID');
  return aliases;
}

function visibility(value: unknown, previousIds: ReadonlySet<string>): VisibilityRule | null {
  if (value === undefined || value === null) return null;
  const rule = exactRecord(value, ['all'], [], 'FORM_RULE_INVALID');
  if (!Array.isArray(rule.all) || rule.all.length < 1 || rule.all.length > 10) throw new Error('FORM_RULE_INVALID');
  return {
    all: rule.all.map((conditionValue) => {
      const condition = exactRecord(conditionValue, ['fieldId', 'operator'], ['value'], 'FORM_RULE_INVALID');
      const fieldId = safeId(condition.fieldId);
      if (!previousIds.has(fieldId)) throw new Error('FORM_RULE_INVALID');
      if (!['equals', 'not_equals', 'in', 'not_in', 'is_blank', 'is_present'].includes(condition.operator as string)) throw new Error('FORM_RULE_INVALID');
      const operator = condition.operator as RuleCondition['operator'];
      if (operator === 'is_blank' || operator === 'is_present') {
        if ('value' in condition) throw new Error('FORM_RULE_INVALID');
        return { fieldId, operator };
      }
      const candidate = condition.value;
      const validPrimitive = typeof candidate === 'string' || typeof candidate === 'boolean' || typeof candidate === 'number' && Number.isFinite(candidate);
      const validArray = Array.isArray(candidate) && candidate.length > 0 && candidate.length <= 20 && candidate.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 128);
      if ((operator === 'in' || operator === 'not_in') ? !validArray : !validPrimitive) throw new Error('FORM_RULE_INVALID');
      return { fieldId, operator, value: candidate as RuleCondition['value'] };
    }),
  };
}

function common(element: Record<string, unknown>, previousIds: ReadonlySet<string>, canonicalFields: ReadonlySet<string>) {
  const id = safeId(element.name);
  const label = safeText(element.title, 256);
  const required = element.isRequired === undefined ? false : element.isRequired;
  if (typeof required !== 'boolean') throw new Error('FORM_SCHEMA_INVALID');
  const canonicalFieldId = element.ospCanonicalFieldId === undefined || element.ospCanonicalFieldId === null
    ? null
    : safeText(element.ospCanonicalFieldId, 128);
  if (canonicalFieldId !== null && (!SAFE_CANONICAL.test(canonicalFieldId) || !canonicalFields.has(canonicalFieldId))) throw new Error('FORM_CANONICAL_FIELD_INVALID');
  return {
    id,
    label,
    required,
    canonicalFieldId,
    supplierAliases: safeAliases(element.ospAliases),
    visibility: visibility(element.ospVisibility, previousIds),
  };
}

function options(value: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_OPTIONS) throw new Error('FORM_SCHEMA_INVALID');
  const parsed = value.map((item) => {
    const option = exactRecord(item, ['value', 'text']);
    return { value: safeId(option.value), label: safeText(option.text, 128) };
  });
  if (new Set(parsed.map((item) => item.value)).size !== parsed.length) throw new Error('FORM_SCHEMA_INVALID');
  return parsed;
}

function definition(element: Record<string, unknown>, kind: FormComponentKind, previousIds: ReadonlySet<string>): FormComponentDefinition {
  if (kind === 'section' || kind === 'instruction') {
    return { kind, text: element.description === undefined ? safeText(element.title, 2_000) : safeText(element.description) };
  }
  if (['text', 'textarea', 'email', 'phone', 'canonical_identifier'].includes(kind)) {
    const minLength = safeInteger(element.minLength, 0, 10_000, 0);
    const maxLength = safeInteger(element.maxLength, 1, 10_000, 2_000);
    if (minLength > maxLength) throw new Error('FORM_SCHEMA_INVALID');
    return { kind: kind as 'text' | 'textarea' | 'email' | 'phone' | 'canonical_identifier', minLength, maxLength };
  }
  if (kind === 'date' || kind === 'number' || kind === 'currency') {
    const minimum = optionalFinite(element.min);
    const maximum = optionalFinite(element.max);
    if (minimum !== null && maximum !== null && minimum > maximum) throw new Error('FORM_SCHEMA_INVALID');
    return { kind, minimum, maximum };
  }
  if (kind === 'single_select' || kind === 'multi_select') return { kind, options: options(element.choices) };
  if (kind === 'yes_no' || kind === 'checkbox') return { kind };
  if (kind === 'repeating_table') {
    if (!Array.isArray(element.columns)) throw new Error('FORM_SCHEMA_INVALID');
    if (element.columns.length < 1 || element.columns.length > MAX_COLUMNS) throw new Error(element.columns.length > MAX_COLUMNS ? 'FORM_LIMIT_EXCEEDED' : 'FORM_SCHEMA_INVALID');
    const columns = element.columns.map((columnValue) => {
      const column = exactRecord(columnValue, ['name', 'title', 'cellType']);
      if (!['text', 'number', 'date'].includes(column.cellType as string)) throw new Error('FORM_SCHEMA_INVALID');
      return { id: safeId(column.name), label: safeText(column.title, 128), valueType: column.cellType as 'text' | 'number' | 'date' };
    });
    if (new Set(columns.map((column) => column.id)).size !== columns.length) throw new Error('FORM_SCHEMA_INVALID');
    return { kind, columns, maxRows: safeInteger(element.maxRowCount, 1, 100, 20) };
  }
  if (kind === 'document_request') {
    const documentType = safeText(element.ospDocumentType, 128);
    if (!SAFE_ID.test(documentType)) throw new Error('FORM_SCHEMA_INVALID');
    return { kind, documentType };
  }
  if (kind === 'derived_readonly') {
    if (element.readOnly !== true || !Array.isArray(element.ospSourceFieldIds) || element.ospSourceFieldIds.length < 1 || element.ospSourceFieldIds.length > 20) throw new Error('FORM_SCHEMA_INVALID');
    const sourceFieldIds = element.ospSourceFieldIds.map(safeId);
    if (sourceFieldIds.some((id) => !previousIds.has(id)) || !['join', 'sum', 'copy'].includes(element.ospOperation as string)) throw new Error('FORM_RULE_INVALID');
    return { kind, sourceFieldIds, operation: element.ospOperation as 'join' | 'sum' | 'copy' };
  }
  const signature = exactRecord(element.ospSignature, ['page', 'anchor', 'x', 'y', 'width', 'height']);
  if (element.readOnly !== true) throw new Error('FORM_SCHEMA_INVALID');
  const page = safeInteger(signature.page, 1, 10_000);
  const anchor = safeText(signature.anchor, 128);
  const coordinates = ['x', 'y', 'width', 'height'].map((key) => optionalFinite(signature[key]));
  if (coordinates.some((coordinate) => coordinate === null || coordinate < 0) || (coordinates[2] ?? 0) <= 0 || (coordinates[3] ?? 0) <= 0) throw new Error('FORM_SCHEMA_INVALID');
  return { kind: 'signature_position', page, anchor, x: coordinates[0]!, y: coordinates[1]!, width: coordinates[2]!, height: coordinates[3]! };
}

const KEYS_BY_KIND: Record<FormComponentKind, readonly string[]> = {
  section: ['type', 'name', 'title', 'description', 'ospKind'],
  instruction: ['type', 'name', 'title', 'description', 'ospKind'],
  text: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'minLength', 'maxLength'],
  textarea: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'minLength', 'maxLength'],
  email: ['type', 'name', 'title', 'isRequired', 'inputType', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'minLength', 'maxLength'],
  phone: ['type', 'name', 'title', 'isRequired', 'inputType', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'minLength', 'maxLength'],
  date: ['type', 'name', 'title', 'isRequired', 'inputType', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'min', 'max'],
  number: ['type', 'name', 'title', 'isRequired', 'inputType', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'min', 'max'],
  currency: ['type', 'name', 'title', 'isRequired', 'inputType', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'min', 'max'],
  canonical_identifier: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'minLength', 'maxLength'],
  single_select: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'choices'],
  multi_select: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'choices'],
  yes_no: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility'],
  checkbox: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility'],
  repeating_table: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'maxRowCount', 'columns'],
  document_request: ['type', 'name', 'title', 'isRequired', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'ospDocumentType'],
  derived_readonly: ['type', 'name', 'title', 'isRequired', 'readOnly', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'ospSourceFieldIds', 'ospOperation'],
  signature_position: ['type', 'name', 'title', 'isRequired', 'readOnly', 'ospKind', 'ospCanonicalFieldId', 'ospAliases', 'ospVisibility', 'ospSignature'],
};

function expectedType(kind: FormComponentKind): string {
  if (kind === 'section' || kind === 'instruction') return 'panel';
  if (kind === 'textarea') return 'comment';
  if (kind === 'single_select') return 'dropdown';
  if (kind === 'multi_select') return 'checkbox';
  if (kind === 'yes_no' || kind === 'checkbox' || kind === 'document_request') return 'boolean';
  if (kind === 'repeating_table') return 'matrixdynamic';
  return 'text';
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function surveyJsonToCanonical(value: unknown, context: ConvertContext): Promise<FormTemplateVersion> {
  if (!UUID.test(context.templateId) || !UUID.test(context.versionId) || !Number.isSafeInteger(context.version) || context.version < 1 || context.version > INT32_MAX || !['draft', 'published'].includes(context.status)) throw new Error('FORM_SCHEMA_INVALID');
  const root = exactRecord(value, ['title', 'pages']);
  safeText(root.title, 256);
  if (!Array.isArray(root.pages) || root.pages.length < 1 || root.pages.length > 20) throw new Error('FORM_LIMIT_EXCEEDED');
  const canonicalFields = new Set(context.canonicalFieldIds.map((field) => {
    if (!SAFE_CANONICAL.test(field)) throw new Error('FORM_CANONICAL_FIELD_INVALID');
    return field;
  }));
  const rawElements: unknown[] = [];
  for (const pageValue of root.pages) {
    const page = exactRecord(pageValue, ['name', 'elements']);
    safeId(page.name);
    if (!Array.isArray(page.elements)) throw new Error('FORM_SCHEMA_INVALID');
    rawElements.push(...page.elements);
  }
  if (rawElements.length < 1 || rawElements.length > MAX_FIELDS) throw new Error('FORM_LIMIT_EXCEEDED');
  const previousIds = new Set<string>();
  const fields: FormComponent[] = [];
  for (const elementValue of rawElements) {
    if (!elementValue || typeof elementValue !== 'object' || Array.isArray(elementValue)) throw new Error('FORM_SCHEMA_INVALID');
    const partial = elementValue as Record<string, unknown>;
    if (typeof partial.ospKind !== 'string' || !(partial.ospKind in KEYS_BY_KIND)) throw new Error('FORM_SCHEMA_INVALID');
    const kind = partial.ospKind as FormComponentKind;
    const keys = KEYS_BY_KIND[kind];
    const element = exactRecord(elementValue, ['type', 'name', 'title', 'ospKind'], keys.filter((key) => !['type', 'name', 'title', 'ospKind'].includes(key)));
    if (element.type !== expectedType(kind)) throw new Error('FORM_SCHEMA_INVALID');
    if ((kind === 'email' && element.inputType !== 'email') || (kind === 'phone' && element.inputType !== 'tel') || (kind === 'date' && element.inputType !== 'date') || (kind === 'number' || kind === 'currency') && element.inputType !== 'number') throw new Error('FORM_SCHEMA_INVALID');
    const shared = common(element, previousIds, canonicalFields);
    if (previousIds.has(shared.id)) throw new Error('FORM_SCHEMA_INVALID');
    const component: FormComponent = { ...shared, definition: definition(element, kind, previousIds) };
    fields.push(component);
    previousIds.add(shared.id);
  }
  const schemaSha256 = await sha256(stable(fields));
  return { id: context.versionId, templateId: context.templateId, version: context.version, status: context.status, fields, schemaSha256 };
}

function sharedSurvey(field: FormComponent, kind: FormComponentKind): Record<string, unknown> {
  const output: Record<string, unknown> = { type: expectedType(kind), name: field.id, title: field.label, ospKind: kind };
  if (field.required) output.isRequired = true;
  if (field.canonicalFieldId !== null) output.ospCanonicalFieldId = field.canonicalFieldId;
  if (field.supplierAliases.length > 0) output.ospAliases = [...field.supplierAliases];
  if (field.visibility !== null) output.ospVisibility = field.visibility;
  return output;
}

export function canonicalToSurveyJson(template: FormTemplateVersion): Record<string, unknown> {
  const elements = template.fields.map((field) => {
    const kind = field.definition.kind;
    const output = sharedSurvey(field, kind);
    const definition = field.definition;
    if (kind === 'section' || kind === 'instruction') {
      const textual = definition as Extract<FormComponentDefinition, { text: string }>;
      if (textual.text !== field.label) output.description = textual.text;
    } else if (['text', 'textarea', 'email', 'phone', 'canonical_identifier'].includes(kind)) {
      Object.assign(output, { minLength: (definition as Extract<FormComponentDefinition, { minLength: number }>).minLength, maxLength: (definition as Extract<FormComponentDefinition, { maxLength: number }>).maxLength });
      if (kind === 'email') output.inputType = 'email';
      if (kind === 'phone') output.inputType = 'tel';
    } else if (kind === 'date' || kind === 'number' || kind === 'currency') {
      output.inputType = kind === 'date' ? 'date' : 'number';
      const bounded = definition as Extract<FormComponentDefinition, { minimum: number | null }>;
      if (bounded.minimum !== null) output.min = bounded.minimum;
      if (bounded.maximum !== null) output.max = bounded.maximum;
    } else if (kind === 'single_select' || kind === 'multi_select') {
      output.choices = (definition as Extract<FormComponentDefinition, { options: readonly unknown[] }>).options.map((option) => ({ ...option, text: option.label, label: undefined })).map(({ value, text }) => ({ value, text }));
    } else if (kind === 'repeating_table') {
      const table = definition as Extract<FormComponentDefinition, { columns: readonly unknown[] }>;
      output.maxRowCount = table.maxRows;
      output.columns = table.columns.map((column) => ({ name: column.id, title: column.label, cellType: column.valueType }));
    } else if (kind === 'document_request') output.ospDocumentType = (definition as Extract<FormComponentDefinition, { documentType: string }>).documentType;
    else if (kind === 'derived_readonly') {
      const derived = definition as Extract<FormComponentDefinition, { sourceFieldIds: readonly string[] }>;
      Object.assign(output, { readOnly: true, ospSourceFieldIds: [...derived.sourceFieldIds], ospOperation: derived.operation });
    } else if (kind === 'signature_position') {
      const signature = definition as Extract<FormComponentDefinition, { page: number }>;
      Object.assign(output, { readOnly: true, ospSignature: { page: signature.page, anchor: signature.anchor, x: signature.x, y: signature.y, width: signature.width, height: signature.height } });
    }
    return output;
  });
  return { title: 'Form template', pages: [{ name: 'page_1', elements }] };
}
