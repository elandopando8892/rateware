const INVALID_RATE_PATTERNS = [/^x$/i, /^n\/?a$/i, /^please estimate$/i, /^tier\s*[123]$/i];

export function isInvalidRateValue(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim();
  if (!normalized) return true;
  return INVALID_RATE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function cleanRateValue(value) {
  return isInvalidRateValue(value) ? null : String(value).trim();
}

export function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
