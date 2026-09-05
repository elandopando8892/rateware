/** Local review draft only. Never a server approval or permission to advance. */
export type ArtifactReviewContext = Readonly<{
  caseId: string;
  manifestSha256: string;
  inventorySha256: string;
  outputSha256: string;
}>;

export type ArtifactReviewField = Readonly<{
  id: string;
  label: string;
  sourceLocation: string;
  allowNotApplicable: boolean;
}>;

export type ArtifactFieldDecision = Readonly<{
  fieldId: string;
  disposition: 'verified' | 'not_applicable' | 'pending';
  outputLocation: string;
  note: string;
}>;

export type ArtifactReviewDraft = Readonly<{
  context: ArtifactReviewContext;
  decisions: readonly ArtifactFieldDecision[];
}>;

const sha = /^[a-f0-9]{64}$/;
const contextKeys = ['caseId', 'manifestSha256', 'inventorySha256', 'outputSha256'] as const;

function validContext(context: ArtifactReviewContext): boolean {
  return typeof context.caseId === 'string' && context.caseId.length > 0 &&
    [context.manifestSha256, context.inventorySha256, context.outputSha256].every((value) => sha.test(value));
}

export function assessArtifactReview(
  context: ArtifactReviewContext,
  inventory: readonly ArtifactReviewField[],
  draft: ArtifactReviewDraft | null,
) {
  const ids = new Set(inventory.map((field) => field.id));
  const invalidInventory = inventory.length === 0 || inventory.length > 1000 || ids.size !== inventory.length ||
    inventory.some((field) => !field.id.trim() || !field.label.trim() || !field.sourceLocation.trim() || typeof field.allowNotApplicable !== 'boolean');
  const stale = !!draft && contextKeys.some((key) => draft.context[key] !== context[key]);
  const invalidDecisions = !!draft && (draft.decisions.length > inventory.length ||
    new Set(draft.decisions.map((item) => item.fieldId)).size !== draft.decisions.length ||
    draft.decisions.some((item) => !ids.has(item.fieldId)));
  const invalid = !validContext(context) || invalidInventory || invalidDecisions;
  const decisions = new Map(!invalid && !stale ? draft?.decisions.map((item) => [item.fieldId, item]) : []);
  const items = inventory.map((field) => {
    const decision = decisions.get(field.id);
    const note = decision?.note.trim() ?? '';
    const location = decision?.outputLocation.trim() ?? '';
    const reasoned = note.length >= 12 && note.length <= 2000;
    const verified = decision?.disposition === 'verified' && reasoned && location.length >= 3 && location.length <= 200;
    const excluded = decision?.disposition === 'not_applicable' && field.allowNotApplicable && reasoned;
    return { fieldId: field.id, status: verified ? 'verified' as const : excluded ? 'not_applicable' as const : 'pending' as const };
  });
  const reviewed = items.filter((item) => item.status === 'verified').length;
  const excluded = items.filter((item) => item.status === 'not_applicable').length;
  return {
    invalid, stale, items, reviewed, excluded,
    pending: inventory.length - reviewed - excluded,
    readyForServerReview: !invalid && !stale && reviewed + excluded === inventory.length,
    // Deliberately no completionPercent: local self-attestation is not fulfillment proof.
    authorizesWorkflow: false as const,
  };
}

export async function fingerprintBytes(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintInventory(inventory: readonly ArtifactReviewField[]): Promise<string> {
  const canonical = [...inventory].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map(({ id, label, sourceLocation, allowNotApplicable }) => [id, label, sourceLocation, allowNotApplicable]);
  return fingerprintBytes(new TextEncoder().encode(JSON.stringify(canonical)).buffer);
}
