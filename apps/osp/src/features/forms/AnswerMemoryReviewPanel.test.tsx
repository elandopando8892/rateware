import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AnswerMemoryReviewPanel } from './AnswerMemoryReviewPanel';
import { createPreviewRuntime } from '../../preview/preview-runtime';

afterEach(cleanup);
const caseId = '11111111-1111-4111-8111-111111111115';
it('requires reason and confirmation; accepts only the exact fresh candidate', async () => {
  const runtime = createPreviewRuntime();
  const workspace = await runtime.apiClient.getCaseFormWorkspace(caseId);
  const onReview = vi.fn(runtime.apiClient.reviewAnswerMemory!);
  render(<AnswerMemoryReviewPanel caseId={caseId} candidates={workspace.answerMemoryCandidates!} allowed onReview={onReview} />);
  const card = within(screen.getByRole('article', { name: 'Razón social de ejemplo' }));
  const reason = card.getByRole('textbox');
  expect(reason).toHaveAttribute('aria-describedby', expect.stringContaining('answer-memory-reason-help-'));
  expect(card.getByRole('checkbox')).toHaveAttribute('id', expect.stringContaining('answer-memory-confirm-'));
  expect(card.getByRole('button', { name: 'Aceptar candidata' })).toBeDisabled();
  const user = userEvent.setup();
  await user.type(card.getByRole('textbox'), 'Revisé la respuesta y la entidad del ejemplo.');
  await user.click(card.getByRole('checkbox'));
  await user.click(card.getByRole('button', { name: 'Aceptar candidata' }));
  expect(await card.findByRole('status')).toHaveTextContent('No habilita autollenado');
  expect(onReview).toHaveBeenCalledTimes(1);
  expect(onReview.mock.calls[0][0]).toMatchObject({ caseId, candidateId: workspace.answerMemoryCandidates![0].id, answerSha256: 'a'.repeat(64), decision: 'accepted' });
  const refreshed = await runtime.apiClient.getCaseFormWorkspace(caseId);
  expect(refreshed.answerMemoryCandidates![0].decision).toBe('accepted');
  expect(refreshed.answerMemory?.approvedForReuse).toBe(false);
});
it('blocks accepting stale or unbound candidates but permits reasoned rejection', async () => {
  const runtime = createPreviewRuntime();
  const workspace = await runtime.apiClient.getCaseFormWorkspace(caseId);
  render(<AnswerMemoryReviewPanel caseId={caseId} candidates={workspace.answerMemoryCandidates!} allowed onReview={runtime.apiClient.reviewAnswerMemory!} />);
  const user = userEvent.setup();
  for (const name of ['Domicilio anterior de ejemplo', 'Correo sin entidad de ejemplo']) {
    const card = within(screen.getByRole('article', { name }));
    await user.type(card.getByRole('textbox'), 'El origen no es vigente para esta entidad.');
    await user.click(card.getByRole('checkbox'));
    expect(card.getByRole('button', { name: 'Aceptar candidata' })).toBeDisabled();
    await user.click(card.getByRole('button', { name: 'Descartar candidata' }));
    expect(await card.findByRole('status')).toHaveTextContent('Evaluación registrada');
  }
});
it('read-only users cannot decide and uncertainty blocks another attempt', async () => {
  const workspace = await createPreviewRuntime().apiClient.getCaseFormWorkspace(caseId);
  const candidate = workspace.answerMemoryCandidates![0];
  const onReview = vi.fn().mockRejectedValue(new Error('Network interrupted'));
  const view = render(<AnswerMemoryReviewPanel caseId={caseId} candidates={[candidate]} allowed={false} onReview={onReview} />);
  expect(screen.getByRole('textbox')).toBeDisabled();
  view.rerender(<AnswerMemoryReviewPanel caseId={caseId} candidates={[candidate]} allowed onReview={onReview} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Confirmación de lectura del dato.');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Aceptar candidata' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Recarga para conciliar');
  expect(screen.getByRole('button', { name: 'Aceptar candidata' })).toBeDisabled();
  expect(onReview).toHaveBeenCalledTimes(1);
});
