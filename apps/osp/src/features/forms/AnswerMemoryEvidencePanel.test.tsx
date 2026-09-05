import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewRuntime } from '../../preview/preview-runtime';
import { AnswerMemoryEvidencePanel } from './AnswerMemoryEvidencePanel';
import { AnswerMemoryReviewPanel } from './AnswerMemoryReviewPanel';

afterEach(cleanup);
const caseId = '11111111-1111-4111-8111-111111111115';
it('compares only after acceptance, displays document scope and never offers a write', async () => {
  const runtime = createPreviewRuntime();
  const workspace = await runtime.apiClient.getCaseFormWorkspace(caseId);
  const candidate = workspace.answerMemoryCandidates![0];
  expect((await runtime.apiClient.getAnswerMemoryEvidence!(caseId, candidate.id)).options).toEqual([]);
  await runtime.apiClient.reviewAnswerMemory!({ caseId, candidateId: candidate.id, answerSha256: candidate.answerSha256, decision: 'accepted', reason: 'Verificación sintética de la entidad.', idempotencyKey: 'evidence-test' });
  const load = vi.fn(() => runtime.apiClient.getAnswerMemoryEvidence!(caseId, candidate.id));
  render(<AnswerMemoryEvidencePanel candidate={candidate} load={load} />);
  expect(load).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar evidencia documental' }));
  expect(await screen.findByText('Necesita renovación auditable de evidencia')).toBeVisible();
  expect(screen.getByText('La revisión documental requiere publicación explícita')).toBeVisible();
  expect(screen.getAllByText(/El documento contiene 3 campos aprobados/)).toHaveLength(2);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect((await runtime.apiClient.getCaseFormWorkspace(caseId)).answerMemory?.approvedForReuse).toBe(false);
});

it('read failure clears comparisons and a repeated read makes no mutation', async () => {
  const workspace = await createPreviewRuntime().apiClient.getCaseFormWorkspace(caseId);
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ options: [], readOnly: true, externalEffects: false });
  render(<AnswerMemoryEvidencePanel candidate={workspace.answerMemoryCandidates![0]} load={load} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se realizó ningún cambio');
  await user.click(screen.getByRole('button'));
  expect(await screen.findByRole('status')).toHaveTextContent('No hay evidencia coincidente');
  expect(load).toHaveBeenCalledTimes(2);
});

it('never exposes the comparison control for pending, rejected or stale answers', async () => {
  const workspace = await createPreviewRuntime().apiClient.getCaseFormWorkspace(caseId);
  const candidates = workspace.answerMemoryCandidates!;
  candidates[1] = { ...candidates[1], decision: 'accepted' };
  render(<AnswerMemoryReviewPanel caseId={caseId} candidates={candidates} allowed onReview={vi.fn()} loadEvidence={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Comparar evidencia documental' })).not.toBeInTheDocument();
});
