import assert from "node:assert/strict";

export function assertAccessibleControlNames(missingNames, route) {
  assert.ok(Array.isArray(missingNames), `${route} accessible-name evidence must be an array`);
  assert.deepEqual(missingNames, [], `${route} visible controls need accessible names`);
}

export function assertContrastSamples(samples, route) {
  assert.ok(Array.isArray(samples) && samples.length > 0, `${route} must expose contrast samples`);
  const failures = samples.filter(({ ratio, threshold }) => (
    !Number.isFinite(ratio)
    || !Number.isFinite(threshold)
    || ratio + Number.EPSILON < threshold
  ));
  assert.deepEqual(failures, [], `${route} visible text must meet WCAG contrast thresholds`);
}

export function assertFocusCycle({ label, first, last, forwardActive, backwardActive }) {
  assert.ok(first && last, `${label} needs at least two focusable controls`);
  assert.equal(forwardActive, first, `${label} forward Tab must wrap to its first control`);
  assert.equal(backwardActive, last, `${label} backward Tab must wrap to its last control`);
}
