import type { FormComponent, FormTemplateVersion } from './surveyjs-canonical-adapter.ts';

export type FormCompletionIssue = {
  fieldId: string;
  label: string;
  code: 'missing' | 'invalid';
  details?: readonly string[];
};

function isBlank(value: unknown): boolean {
  return value === null || value === undefined ||
    typeof value === 'string' && value.trim().length === 0 ||
    Array.isArray(value) && value.length === 0;
}

function missingValue(field: FormComponent, value: unknown): boolean {
  if (isBlank(value)) return true;
  // A negative answer is supplied data; an unchecked required consent is not acceptance.
  if (field.definition.kind === 'checkbox') return value === false;
  if (field.definition.kind === 'repeating_table' && Array.isArray(value)) {
    return value.every((row) => row && typeof row === 'object' && !Array.isArray(row) &&
      Object.values(row).every(isBlank));
  }
  return false;
}

function visible(field: FormComponent, values: Record<string, unknown>): boolean {
  if (!field.visibility) return true;
  return field.visibility.all.every((condition) => {
    const value = values[condition.fieldId];
    switch (condition.operator) {
      case 'equals': return value === condition.value;
      case 'not_equals': return value !== condition.value;
      case 'in': return Array.isArray(condition.value) && condition.value.includes(value as never);
      case 'not_in': return Array.isArray(condition.value) && !condition.value.includes(value as never);
      case 'is_blank': return isBlank(value);
      case 'is_present': return !isBlank(value);
    }
  });
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function tableProblems(field: FormComponent, value: unknown): string[] {
  const table = field.definition;
  if (table.kind !== 'repeating_table') return [];
  if (!Array.isArray(value)) return ['A table of rows is required.'];
  const minimum = Math.max(table.minRows ?? 0, field.required ? 1 : 0);
  const problems: string[] = [];
  if (value.length < minimum) problems.push(`At least ${minimum} rows required; ${value.length} provided.`);
  if (value.length > table.maxRows) return [`At most ${table.maxRows} rows allowed.`];
  const keys = new Set<string>();
  value.forEach((row, index) => {
    const prefix = `Row ${index + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) { problems.push(`${prefix}: invalid row.`); return; }
    if (Object.values(row).every(isBlank)) { problems.push(`${prefix}: empty row.`); return; }
    if (Object.keys(row).some((key) => !table.columns.some((column) => column.id === key))) problems.push(`${prefix}: unrecognized column.`);
    for (const column of table.columns) {
      const item: unknown = row[column.id];
      if (isBlank(item)) {
        if (column.required || column.id === table.uniqueBy) problems.push(`${prefix}: ${column.label} is required.`);
        continue;
      }
      const valid = column.valueType === 'number' ? typeof item === 'number' && Number.isFinite(item)
        : column.valueType === 'date' ? typeof item === 'string' && validDate(item)
        : column.valueType === 'email' ? typeof item === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)
        : column.valueType === 'phone' ? typeof item === 'string' && /^[+\d\s().-]+$/.test(item) && item.replace(/\D/g, '').length >= 7 && item.replace(/\D/g, '').length <= 15
        : typeof item === 'string';
      if (!valid) problems.push(`${prefix}: ${column.label} is invalid.`);
    }
    if (table.uniqueBy && !isBlank(row[table.uniqueBy])) {
      const key = String(row[table.uniqueBy]).trim().toLocaleLowerCase('en-US');
      if (keys.has(key)) problems.push(`${prefix}: duplicate ${table.columns.find((column) => column.id === table.uniqueBy)!.label}.`);
      keys.add(key);
    }
  });
  return problems;
}

function validValue(field: FormComponent, value: unknown): boolean {
  const definition = field.definition;
  switch (definition.kind) {
    case 'section':
    case 'instruction':
    case 'derived_readonly':
    case 'signature_position':
      return true;
    case 'text':
    case 'textarea':
    case 'canonical_identifier':
    case 'phone':
    case 'email': {
      if (typeof value !== 'string' || value.length < definition.minLength || value.length > definition.maxLength) return false;
      return definition.kind !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    case 'date':
      return typeof value === 'string' && validDate(value);
    case 'number':
    case 'currency':
      return typeof value === 'number' && Number.isFinite(value) &&
        (definition.minimum === null || value >= definition.minimum) &&
        (definition.maximum === null || value <= definition.maximum);
    case 'single_select':
      return typeof value === 'string' && definition.options.some((option) => option.value === value);
    case 'multi_select':
      return Array.isArray(value) && value.length <= definition.options.length && new Set(value).size === value.length &&
        value.every((item) => typeof item === 'string' && definition.options.some((option) => option.value === item));
    case 'yes_no':
    case 'checkbox':
      return typeof value === 'boolean';
    case 'repeating_table':
      return tableProblems(field, value).length === 0;
    case 'document_request':
      return typeof value === 'string' && value.trim().length > 0 || Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return false;
}

function collectsInput(field: FormComponent): boolean {
  return !['section', 'instruction', 'derived_readonly', 'signature_position'].includes(field.definition.kind);
}

export function assessFormCompletion(template: Pick<FormTemplateVersion, 'fields'>, values: Record<string, unknown>) {
  const visibleFields = template.fields.filter((field) => collectsInput(field) && visible(field, values));
  const conditionalExclusions = template.fields.filter((field) => collectsInput(field) && !visible(field, values))
    .map((field) => ({ fieldId: field.id, label: field.label }));
  const requiredFields = visibleFields.filter((field) => field.required);
  const issues: FormCompletionIssue[] = [];
  for (const field of visibleFields) {
    const value = values[field.id];
    if (field.definition.kind === 'repeating_table' && (field.required || !isBlank(value))) {
      const details = tableProblems(field, value ?? []);
      if (details.length > 0) issues.push({ fieldId: field.id, label: field.label, code: missingValue(field, value) ? 'missing' : 'invalid', details });
      continue;
    }
    if (field.required && missingValue(field, value)) issues.push({ fieldId: field.id, label: field.label, code: 'missing' });
    else if (isBlank(value)) continue;
    else if (!validValue(field, value)) issues.push({ fieldId: field.id, label: field.label, code: 'invalid' });
  }
  const requiredIssueIds = new Set(issues.filter((issue) => requiredFields.some((field) => field.id === issue.fieldId)).map((issue) => issue.fieldId));
  const completed = requiredFields.length - requiredIssueIds.size;
  return Object.freeze({
    required: requiredFields.length,
    completed,
    progress: requiredFields.length === 0 ? 0 : Math.round(completed / requiredFields.length * 100),
    issues: Object.freeze(issues),
    conditionalExclusions: Object.freeze(conditionalExclusions),
    ready: requiredFields.length > 0 && issues.length === 0,
  });
}
