export type PreparationScalar = string | number | boolean;

export type PreparationCandidate = Readonly<{
  fieldKey: string;
  value: unknown;
  source: "rateware" | "attachment";
  confidence: number;
  validation: "valid" | "low_confidence" | "contradictory" | "invalid";
  evidenceIds: readonly string[];
}>;

export type PreparationTemplateField = Readonly<{
  fieldId: string;
  canonicalFieldId: string | null;
  supplierAliases: readonly string[];
  required: boolean;
}>;

export type AutomaticPreparationInput = Readonly<{
  caseId: string;
  extractionId: string;
  templateVersionId: string;
  fields: readonly PreparationTemplateField[];
  candidates: readonly PreparationCandidate[];
  currentValues: Readonly<Record<string, unknown>>;
}>;

export type PreparationFieldResult = Readonly<{
  fieldId: string;
  source: "existing_draft" | "rateware" | "attachment" | "missing";
  status: "prepared" | "missing" | "contradictory";
  evidenceIds: readonly string[];
}>;

export type AutomaticPreparationPlan = Readonly<{
  status:
    | "ready_for_operations_review"
    | "awaiting_xbf_information"
    | "awaiting_clarification";
  values: Readonly<Record<string, PreparationScalar>>;
  fields: readonly PreparationFieldResult[];
  externalEffects: false;
}>;

export interface AutomaticPreparationStore {
  load(input: {
    organizationId: string;
    caseId: string;
    extractionId: string;
    templateVersionId: string;
  }): Promise<AutomaticPreparationInput>;
  persist(input: {
    organizationId: string;
    correlationId: string;
    caseId: string;
    extractionId: string;
    templateVersionId: string;
    plan: AutomaticPreparationPlan;
  }): Promise<void>;
}

export interface AutomaticPreparationService {
  prepare(input: {
    organizationId: string;
    caseId: string;
    extractionId: string;
    templateVersionId: string;
    correlationId: string;
  }): Promise<AutomaticPreparationPlan>;
}

function scalar(value: unknown): PreparationScalar | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return typeof value === "boolean" ? value : null;
}

function stable(value: PreparationScalar): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function eligible(candidate: PreparationCandidate): boolean {
  const value = scalar(candidate.value);
  const labelOnlyAttachment = candidate.source === "attachment" &&
    typeof value === "string" && value.length <= 96 &&
    value.endsWith(":") && !/[0-9]/.test(value);
  return candidate.validation === "valid" &&
    Number.isFinite(candidate.confidence) && candidate.confidence >= 0.8 &&
    value !== null && !labelOnlyAttachment && candidate.evidenceIds.length > 0;
}

function matches(
  field: PreparationTemplateField,
  candidate: PreparationCandidate,
): boolean {
  return candidate.fieldKey === field.fieldId ||
    candidate.fieldKey === field.canonicalFieldId ||
    field.supplierAliases.includes(candidate.fieldKey);
}

function distinct(
  candidates: readonly PreparationCandidate[],
): readonly PreparationCandidate[] {
  const byValue = new Map<string, PreparationCandidate>();
  for (const candidate of candidates) {
    const value = scalar(candidate.value);
    if (value !== null && !byValue.has(stable(value))) {
      byValue.set(stable(value), candidate);
    }
  }
  return [...byValue.values()];
}

function evidence(
  candidates: readonly PreparationCandidate[],
): readonly string[] {
  return [...new Set(candidates.flatMap((candidate) => candidate.evidenceIds))]
    .sort();
}

export function prepareCaseForm(
  input: AutomaticPreparationInput,
): AutomaticPreparationPlan {
  const values: Record<string, PreparationScalar> = {};
  const fields: PreparationFieldResult[] = [];
  let missingXbf = false;
  let missingSupplier = false;
  let contradiction = false;

  for (const field of input.fields) {
    const current = scalar(input.currentValues[field.fieldId]);
    if (current !== null) {
      values[field.fieldId] = current;
      fields.push({
        fieldId: field.fieldId,
        source: "existing_draft",
        status: "prepared",
        evidenceIds: [],
      });
      continue;
    }

    const candidates = input.candidates.filter((candidate) =>
      eligible(candidate) && matches(field, candidate)
    );
    const rateware = distinct(
      candidates.filter((candidate) => candidate.source === "rateware"),
    );
    const attachment = distinct(
      candidates.filter((candidate) => candidate.source === "attachment"),
    );
    const selected = rateware[0] ?? attachment[0] ?? null;
    const selectedValue = selected ? scalar(selected.value) : null;
    const allValues = distinct([...rateware, ...attachment]);

    if (selectedValue === null) {
      fields.push({
        fieldId: field.fieldId,
        source: "missing",
        status: "missing",
        evidenceIds: [],
      });
      if (field.required) {
        if (field.canonicalFieldId) missingXbf = true;
        else missingSupplier = true;
      }
      continue;
    }

    values[field.fieldId] = selectedValue;
    const isContradictory = allValues.length > 1;
    contradiction ||= isContradictory;
    fields.push({
      fieldId: field.fieldId,
      source: selected.source,
      status: isContradictory ? "contradictory" : "prepared",
      evidenceIds: evidence([...rateware, ...attachment]),
    });
  }

  return Object.freeze({
    status: contradiction || missingSupplier
      ? "awaiting_clarification"
      : missingXbf
      ? "awaiting_xbf_information"
      : "ready_for_operations_review",
    values: Object.freeze(values),
    fields: Object.freeze(fields),
    externalEffects: false,
  });
}

export function createAutomaticPreparationService(
  store: AutomaticPreparationStore,
): AutomaticPreparationService {
  const service: AutomaticPreparationService = {
    async prepare(input) {
      const source = await store.load(input);
      if (
        source.caseId !== input.caseId ||
        source.extractionId !== input.extractionId ||
        source.templateVersionId !== input.templateVersionId
      ) throw new Error("INVALID_INPUT");
      const plan = prepareCaseForm(source);
      await store.persist({ ...input, plan });
      return plan;
    },
  };
  return Object.freeze(service);
}
