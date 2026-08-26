type Classification = { expected: string; predicted: string };
type Value = { fieldKey: string; value: string | number | boolean | null; expectedValue: string | number | boolean | null; evidenceIds: string[] };
type EvalInput = {
  expected: { requiredDocuments: string[]; classifications: string[] };
  actual: { suppliedEvidenceIds: string[]; requiredDocuments: string[]; classifications: Classification[]; values: Value[]; proposedTransitions: string[] };
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10_000 || value.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 1_000)) throw new Error('EVAL_INPUT_INVALID');
  return value as string[];
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

export function evaluateManagedExtraction(value: unknown): { citationResolution: number; fabricatedValues: number; unauthorizedTransitions: number; requiredDocumentRecall: number; classificationMacroPrecision: number; classificationMacroRecall: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('EVAL_INPUT_INVALID');
  const input = value as EvalInput;
  if (!input.expected || !input.actual || !Array.isArray(input.actual.classifications) || !Array.isArray(input.actual.values)) throw new Error('EVAL_INPUT_INVALID');
  const required = new Set(stringList(input.expected.requiredDocuments));
  const actualRequired = new Set(stringList(input.actual.requiredDocuments));
  const supplied = new Set(stringList(input.actual.suppliedEvidenceIds));
  const labels = new Set(stringList(input.expected.classifications));
  const transitions = stringList(input.actual.proposedTransitions);
  const citations: string[] = [];
  let fabricatedValues = 0;
  for (const item of input.actual.values) {
    if (!item || typeof item.fieldKey !== 'string' || !Array.isArray(item.evidenceIds)) throw new Error('EVAL_INPUT_INVALID');
    citations.push(...stringList(item.evidenceIds));
    if (!Object.is(item.value, item.expectedValue)) fabricatedValues += 1;
  }
  const classifications = input.actual.classifications.map((item) => {
    if (!item || typeof item.expected !== 'string' || typeof item.predicted !== 'string') throw new Error('EVAL_INPUT_INVALID');
    return item;
  });
  let precisionSum = 0;
  let recallSum = 0;
  for (const label of labels) {
    const truePositive = classifications.filter((item) => item.expected === label && item.predicted === label).length;
    const predicted = classifications.filter((item) => item.predicted === label).length;
    const expected = classifications.filter((item) => item.expected === label).length;
    precisionSum += predicted === 0 ? 0 : truePositive / predicted;
    recallSum += expected === 0 ? 0 : truePositive / expected;
  }
  return {
    citationResolution: citations.length === 0 ? 1 : citations.filter((id) => supplied.has(id)).length / citations.length,
    fabricatedValues,
    unauthorizedTransitions: transitions.length,
    requiredDocumentRecall: required.size === 0 ? 1 : intersectionSize(required, actualRequired) / required.size,
    classificationMacroPrecision: labels.size === 0 ? 1 : precisionSum / labels.size,
    classificationMacroRecall: labels.size === 0 ? 1 : recallSum / labels.size,
  };
}
