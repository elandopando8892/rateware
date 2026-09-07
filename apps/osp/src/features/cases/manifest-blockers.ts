import type { RequestManifestReadModel } from '../../api/contracts';

export type ManifestBlockerKind = 'contradiction' | 'missing' | 'clarification';

export type ManifestBlocker = {
  kind: ManifestBlockerKind;
  fieldId: string | null;
  text: string;
  evidenceIds: readonly string[];
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function manifestBlockerKey(kind: ManifestBlockerKind, fieldId: string | null, text: string) {
  return `${kind}:${fieldId ?? ''}:${normalizeText(text)}`;
}

export function manifestDecisionKey(kind: ManifestBlockerKind, fieldId: string | null, text: string) {
  const scope = kind === 'contradiction' ? 'contradiction' : `field:${fieldId ?? ''}`;
  return `${scope}:${normalizeText(text)}`;
}

/**
 * Returns one entry per distinct evidence issue without hiding different
 * constraints for the same field. Exact duplicates retain the union of their
 * citations so the human reviewer sees the complete provenance.
 */
export function manifestBlockers(manifest: RequestManifestReadModel): readonly ManifestBlocker[] {
  const candidates: ManifestBlocker[] = [
    ...manifest.contradictions.map((item) => ({ kind: 'contradiction' as const, fieldId: null, text: item.text, evidenceIds: item.evidenceIds })),
    ...manifest.missingInformation.map((item) => ({ kind: 'missing' as const, fieldId: item.fieldId, text: item.description, evidenceIds: item.evidenceIds })),
    ...manifest.clarificationQuestions.map((item) => ({ kind: 'clarification' as const, fieldId: item.fieldId, text: item.question, evidenceIds: item.evidenceIds })),
  ];
  const grouped = new Map<string, ManifestBlocker>();
  for (const candidate of candidates) {
    const key = manifestBlockerKey(candidate.kind, candidate.fieldId, candidate.text);
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, candidate);
      continue;
    }
    grouped.set(key, {
      ...previous,
      evidenceIds: [...new Set([...previous.evidenceIds, ...candidate.evidenceIds])],
    });
  }
  return [...grouped.values()];
}
