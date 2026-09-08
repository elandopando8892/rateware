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
  const compare = screen.getByRole('button', { name: 'Comparar evidencia documental' });
  expect(compare).toHaveAttribute('aria-controls', expect.stringContaining('answer-memory-evidence-results-'));
  expect(compare).toHaveAttribute('aria-expanded', 'false');
  await userEvent.setup().click(compare);
  expect(compare).toHaveAttribute('aria-expanded', 'true');
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

async function acceptedExample() {
  const runtime = createPreviewRuntime();
  const candidate = (await runtime.apiClient.getCaseFormWorkspace(caseId)).answerMemoryCandidates![0];
  await runtime.apiClient.reviewAnswerMemory!({ caseId, candidateId: candidate.id, answerSha256: candidate.answerSha256, decision: 'accepted', reason: 'Verificación sintética de la entidad.', idempotencyKey: 'accepted-for-link' });
  return { runtime, candidate: { ...candidate, decision: 'accepted' as const }, load: () => runtime.apiClient.getAnswerMemoryEvidence!(caseId,candidate.id) };
}

it('requires exact confirmation, records renewal once and exposes a currently reusable synthetic fact', async () => {
  const { runtime, candidate, load } = await acceptedExample();
  const onLink = vi.fn(runtime.apiClient.linkAnswerMemoryEvidence!);
  const user = userEvent.setup();
  render(<AnswerMemoryEvidencePanel candidate={candidate} caseId={caseId} load={load} onLink={onLink} />);
  await user.click(screen.getByRole('button', {name:'Comparar evidencia documental'}));
  const button = screen.getByRole('button', {name:'Renovar respaldo y vincular'});
  expect(button).toBeDisabled();
  await user.type(screen.getByRole('textbox'), 'Revisé la evidencia nueva y vigente.');
  expect(button).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));
  await user.dblClick(button);
  expect(await screen.findByRole('status')).toHaveTextContent('Renovación y vínculo registrados');
  expect(onLink).toHaveBeenCalledOnce();
  expect(onLink.mock.calls[0][0]).toMatchObject({ caseId, candidateId:candidate.id, action:'renew', confirmed:true, expectationSha256:'b'.repeat(64) });
  expect((await load()).options[0].state).toBe('already_reusable');
  const replay = await runtime.apiClient.linkAnswerMemoryEvidence!(onLink.mock.calls[0][0]);
  expect(replay.replayed).toBe(true);
  expect((await createPreviewRuntime().apiClient.getAnswerMemoryEvidence!(caseId,candidate.id)).options).toEqual([]);
});

it('an ambiguous response preserves the exact intent and reconciles without another renewal', async () => {
  const { runtime, candidate, load } = await acceptedExample();
  const onLink = vi.fn(async (input: Parameters<NonNullable<typeof runtime.apiClient.linkAnswerMemoryEvidence>>[0]) => {
    const result = await runtime.apiClient.linkAnswerMemoryEvidence!(input);
    if (!result.replayed) throw new Error('lost response after commit');
    return result;
  });
  render(<AnswerMemoryEvidencePanel candidate={candidate} caseId={caseId} load={load} onLink={onLink} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Comparar evidencia documental'}));
  await user.type(screen.getByRole('textbox'), 'Revisé exactamente este respaldo.');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', {name:'Renovar respaldo y vincular'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('misma clave e intención');
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByRole('button', {name:'Comparar evidencia documental'})).toBeDisabled();
  await user.click(screen.getByRole('button', {name:'Conciliar el mismo intento'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Renovación y vínculo registrados');
  expect(onLink.mock.calls[1][0]).toEqual(onLink.mock.calls[0][0]);
});

it('never enables a write for a reader or a backend without a fingerprint', async () => {
  const { candidate, load } = await acceptedExample();
  const onLink = vi.fn();
  const view = render(<AnswerMemoryReviewPanel caseId={caseId} candidates={[candidate]} allowed={false} onReview={vi.fn()} loadEvidence={load} onLinkEvidence={onLink} />);
  await userEvent.setup().click(screen.getByRole('button', {name:'Comparar evidencia documental'}));
  expect(screen.queryByRole('button', {name:'Renovar respaldo y vincular'})).not.toBeInTheDocument();
  view.unmount();
  const options = (await load()).options.map((item) => { const option = { ...item }; delete option.expectationSha256; return option; });
  render(<AnswerMemoryEvidencePanel candidate={candidate} caseId={caseId} onLink={onLink} load={async () => ({ options,readOnly:true,externalEffects:false })} />);
  await userEvent.setup().click(screen.getByRole('button', {name:'Comparar evidencia documental'}));
  expect(screen.queryByRole('button', {name:'Renovar respaldo y vincular'})).not.toBeInTheDocument();
  expect(onLink).not.toHaveBeenCalled();
});
