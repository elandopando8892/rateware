import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessArtifactReview, fingerprintInventory } from './artifact-review';
import type { ArtifactReviewContext, ArtifactReviewDraft, ArtifactReviewField } from './artifact-review';

const context: ArtifactReviewContext = { caseId: 'case-a', manifestSha256: 'a'.repeat(64), inventorySha256: 'b'.repeat(64), outputSha256: 'c'.repeat(64) };
const inventory: ArtifactReviewField[] = [
  { id: 'name', label: 'Legal name', sourceLocation: 'Source page 1', allowNotApplicable: false },
  { id: 'optional', label: 'Fourth reference', sourceLocation: 'Source page 2', allowNotApplicable: true },
];
const complete: ArtifactReviewDraft = { context, decisions: [
  { fieldId: 'name', disposition: 'verified', outputLocation: 'Page 1', note: 'Full legal name matches reviewed evidence.' },
  { fieldId: 'optional', disposition: 'not_applicable', outputLocation: '', note: 'The request requires only three references.' },
] };
afterEach(() => vi.unstubAllGlobals());

describe('exact artifact review draft', () => {
  it('counts reviewed, excluded and unresolved fields separately without granting approval', () => {
    expect(assessArtifactReview(context, inventory, null)).toMatchObject({ pending: 2, readyForServerReview: false, authorizesWorkflow: false });
    expect(assessArtifactReview(context, inventory, complete)).toMatchObject({ reviewed: 1, excluded: 1, pending: 0, readyForServerReview: true, authorizesWorkflow: false });
    expect(assessArtifactReview(context, inventory, complete)).not.toHaveProperty('completionPercent');
  });
  for (const key of ['caseId', 'manifestSha256', 'inventorySha256', 'outputSha256'] as const) {
    it(`invalidates every decision when ${key} changes`, () => {
      expect(assessArtifactReview({ ...context, [key]: key === 'caseId' ? 'case-b' : 'd'.repeat(64) }, inventory, complete))
        .toMatchObject({ stale: true, reviewed: 0, excluded: 0, pending: 2, readyForServerReview: false });
    });
  }
  it('does not accept a checkbox, an empty location or an unexplained exclusion', () => {
    for (const patch of [{ note: '' }, { outputLocation: '' }, { disposition: 'not_applicable' as const }]) {
      expect(assessArtifactReview(context, inventory, { ...complete, decisions: [{ ...complete.decisions[0], ...patch }, complete.decisions[1]] }).readyForServerReview).toBe(false);
    }
    expect(assessArtifactReview(context, inventory, { ...complete, decisions: [complete.decisions[0], { ...complete.decisions[1], note: 'N/A' }] }).pending).toBe(1);
  });
  it('rejects duplicate and unknown decisions instead of silently overwriting them', () => {
    for (const decisions of [[complete.decisions[0], complete.decisions[0]], [{ ...complete.decisions[0], fieldId: 'unknown' }]]) {
      expect(assessArtifactReview(context, inventory, { context, decisions })).toMatchObject({ invalid: true, reviewed: 0, readyForServerReview: false });
    }
  });
  it('rejects missing fingerprints, empty or duplicate inventories', () => {
    expect(assessArtifactReview({ ...context, outputSha256: '' }, inventory, complete).invalid).toBe(true);
    for (const fields of [[], [inventory[0], inventory[0]]]) {
      expect(assessArtifactReview(context, fields, null)).toMatchObject({ invalid: true, readyForServerReview: false });
    }
  });
  it('fingerprints inventory contents and applicability, independent of display order', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const hash = await fingerprintInventory(inventory);
    expect(await fingerprintInventory([...inventory].reverse())).toBe(hash);
    for (const patch of [{ label: 'Changed requirement' }, { sourceLocation: 'Different source' }, { allowNotApplicable: true }]) {
      expect(await fingerprintInventory([{ ...inventory[0], ...patch }, inventory[1]])).not.toBe(hash);
    }
  });
});
