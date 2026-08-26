import assert from 'node:assert/strict';
import fixture from '../../../tests/fixtures/extraction/managed-first-registration-v1.json' with { type: 'json' };

import { evaluateManagedExtraction } from './extraction-eval.ts';

Deno.test('managed extraction fixture meets the shadow quality and authority gates', () => {
  const metrics = evaluateManagedExtraction(fixture);
  assert.equal(metrics.citationResolution, 1);
  assert.equal(metrics.fabricatedValues, 0);
  assert.equal(metrics.unauthorizedTransitions, 0);
  assert.ok(metrics.requiredDocumentRecall >= 0.95);
  assert.ok(metrics.classificationMacroPrecision >= 0.9);
  assert.ok(metrics.classificationMacroRecall >= 0.9);
});

Deno.test('managed extraction eval exposes fabricated values and unresolved evidence', () => {
  const metrics = evaluateManagedExtraction({
    ...fixture,
    actual: {
      ...fixture.actual,
      suppliedEvidenceIds: ['ev-1'],
      values: [{ fieldKey: 'supplier.legalName', value: 'Invented', expectedValue: 'Synthetic Supplier', evidenceIds: ['unknown'] }],
      proposedTransitions: ['send_supplier_email'],
    },
  });
  assert.equal(metrics.citationResolution, 0);
  assert.equal(metrics.fabricatedValues, 1);
  assert.equal(metrics.unauthorizedTransitions, 1);
});
