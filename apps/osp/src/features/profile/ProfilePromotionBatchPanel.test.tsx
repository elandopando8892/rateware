import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { previewProfilePromotion } from '../../preview/profile-batch-fixture';
import { ProfilePromotionBatchPanel } from './ProfilePromotionBatchPanel';
import { ProfilePromotionBatchSchema } from './profile-promotion-batch-contract';

afterEach(cleanup);
it('shows the whole batch and no unchecked field-level publication', async () => {
  const promote = vi.fn();
  render(<ProfilePromotionBatchPanel candidate={previewProfilePromotion} pending={false} onPromote={promote} />);
  for (const label of ['Nuevo', 'Reemplaza', 'Sin cambio', 'Reservado · excluido', 'Rechazado · excluido']) expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(button);
  expect(promote).toHaveBeenCalledExactlyOnceWith(previewProfilePromotion);
});
it.each(['missing', 'stale', 'scope', 'blocked'] as const)('fails closed for %s comparison', (kind) => {
  const candidate = structuredClone(previewProfilePromotion);
  if (kind === 'missing') delete candidate.batch;
  if (kind === 'stale') candidate.review_revision += 1;
  if (kind === 'scope') candidate.expected_current_fact_ids = { entity_type: null };
  if (kind === 'blocked') candidate.batch!.ready = false;
  render(<ProfilePromotionBatchPanel candidate={candidate} pending={false} onPromote={vi.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('resets confirmation when the exact snapshot key changes and disables pending writes', async () => {
  const first = structuredClone(previewProfilePromotion);
  const renderPanel = (candidate = first, pending = false) => <ProfilePromotionBatchPanel key={candidate.batch!.comparisonSha256} candidate={candidate} pending={pending} onPromote={vi.fn()} />;
  const { rerender } = render(renderPanel());
  await userEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button')).toBeEnabled();
  const changed = structuredClone(first); changed.batch!.comparisonSha256 = 'c'.repeat(64);
  rerender(renderPanel(changed));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button')).toBeDisabled();
  rerender(renderPanel(changed, true));
  expect(screen.getByRole('checkbox')).toBeDisabled();
});
it('rejects a partial batch, restricted-value exposure and invalid unchanged claims', () => {
  const full = previewProfilePromotion.batch!;
  const partial = structuredClone(full); partial.rows.pop();
  expect(ProfilePromotionBatchSchema.safeParse(partial).success).toBe(false);
  const leaked = structuredClone(full); leaked.rows[3].after = 'forbidden';
  expect(ProfilePromotionBatchSchema.safeParse(leaked).success).toBe(false);
  const mismatch = structuredClone(full); mismatch.rows[2].before = 'different';
  expect(ProfilePromotionBatchSchema.safeParse(mismatch).success).toBe(false);
});
