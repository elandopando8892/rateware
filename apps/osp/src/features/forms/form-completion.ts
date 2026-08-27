import type { FormComponent, FormTemplateVersion } from './surveyjs-canonical-adapter.ts';

export type FormCompletionIssue = {
  fieldId: string;
  label: string;
  code: 'missing' | 'invalid';
};

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === false ||
    typeof value === 'string' && value.trim().length === 0 ||
    Array.isArray(value) && value.length === 0;
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
      return Array.isArray(value) && value.length <= definition.maxRows && value.every((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
        return Object.entries(row as Record<string, unknown>).every(([key, item]) => {
          const column = definition.columns.find((candidate) => candidate.id === key);
          if (!column) return false;
          if (isBlank(item)) return true;
          if (column.valueType === 'number') return typeof item === 'number' && Number.isFinite(item);
          if (column.valueType === 'date') return typeof item === 'string' && validDate(item);
          return typeof item === 'string';
        });
      });
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
  const requiredFields = visibleFields.filter((field) => field.required);
  const issues: FormCompletionIssue[] = [];
  for (const field of visibleFields) {
    const value = values[field.id];
    if (field.required && isBlank(value)) issues.push({ fieldId: field.id, label: field.label, code: 'missing' });
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
    ready: requiredFields.length > 0 && issues.length === 0,
  });
}
