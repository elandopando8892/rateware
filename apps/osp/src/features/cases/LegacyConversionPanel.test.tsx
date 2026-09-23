import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { LegacyConversionPanel, type ConversionClient } from './LegacyConversionPanel';

const caseId = '22222222-2222-4222-8222-222222222222';
const attachment = { attachment_id: '33333333-3333-4333-8333-333333333333', filename: 'QF-167.doc', source_sha256: 'a'.repeat(64) };
const candidateId = '44444444-4444-4444-8444-444444444444';
const convertedSha256 = 'b'.repeat(64);
afterEach(() => cleanup());

function harness(status: 'review_required' | 'approved' = 'review_required') {
  const listManualConversionCandidates = vi.fn(async () => [{ id: candidateId, convertedSha256, version: 1,
    status, createdAt: '2026-09-22T00:00:00.000Z', conversionId: null }]);
  const client = {
    listManualConversionCandidates,
    getManualConversionSource: vi.fn(async () => ({ downloadUrl: 'https://storage.example.test/original',
      filename: attachment.filename, sourceSha256: attachment.source_sha256, expiresInSeconds: 60 as const })),
    getManualConversionCandidate: vi.fn(async () => ({ downloadUrl: 'https://storage.example.test/converted',
      convertedSha256, expiresInSeconds: 60 as const })),
    uploadCaseConversion: vi.fn(async () => ({ id: candidateId, version: 1, convertedSha256 })),
    approveDocumentVersion: vi.fn(async () => ({ id: candidateId, status: 'approved' as const })),
    recordManualConversionReview: vi.fn(async () => ({ conversionId: '55555555-5555-4555-8555-555555555555', replayed: false })),
  } satisfies ConversionClient;
  const onResolved = vi.fn(async () => undefined);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LegacyConversionPanel client={client} caseId={caseId} attachment={attachment} onResolved={onResolved} />
  </QueryClientProvider>);
  return { client, onResolved };
}

it('requires both downloads, matching pages and explicit fidelity confirmation before linking', async () => {
  const { client, onResolved } = harness();
  const approve = await screen.findByRole('button', { name: /aprobar y vincular/i });
  expect(approve).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /preparar descarga del original/i }));
  expect(await screen.findByRole('link', { name: /descargar original/i })).toHaveAttribute('href', 'https://storage.example.test/original');
  await userEvent.click(screen.getByRole('button', { name: /preparar descarga del docx/i }));
  expect(await screen.findByRole('link', { name: /descargar docx/i })).toHaveAttribute('href', 'https://storage.example.test/converted');
  fireEvent.change(screen.getByLabelText(/páginas del original/i), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText(/páginas del docx/i), { target: { value: '2' } });
  expect(approve).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/páginas del docx/i), { target: { value: '3' } });
  expect(approve).toBeDisabled();
  await userEvent.click(screen.getByLabelText(/comparé ambos archivos/i));
  await userEvent.click(approve);
  await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
  expect(client.approveDocumentVersion).toHaveBeenCalledWith({ versionId: candidateId, expectedVersion: 1,
    reviewBeforeSha256: convertedSha256, reviewAfterSha256: convertedSha256 });
  expect(client.recordManualConversionReview).toHaveBeenCalledWith({ caseId,
    sourceAttachmentId: attachment.attachment_id, sourceSha256: attachment.source_sha256,
    convertedDocumentVersionId: candidateId, convertedSha256, sourcePageCount: 3,
    convertedPageCount: 3, fidelityConfirmed: true });
});

it('resumes an already-approved candidate without repeating the document approval', async () => {
  const { client, onResolved } = harness('approved');
  await screen.findByRole('button', { name: /aprobar y vincular/i });
  await userEvent.click(screen.getByRole('button', { name: /preparar descarga del original/i }));
  await userEvent.click(screen.getByRole('button', { name: /preparar descarga del docx/i }));
  fireEvent.change(screen.getByLabelText(/páginas del original/i), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText(/páginas del docx/i), { target: { value: '2' } });
  await userEvent.click(screen.getByLabelText(/comparé ambos archivos/i));
  await userEvent.click(screen.getByRole('button', { name: /aprobar y vincular/i }));
  await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
  expect(client.approveDocumentVersion).not.toHaveBeenCalled();
  expect(client.recordManualConversionReview).toHaveBeenCalledOnce();
});
