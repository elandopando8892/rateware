import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArtifactReviewPanel } from './ArtifactReviewPanel';
import type { ArtifactReviewField } from './artifact-review';

const inventory: ArtifactReviewField[] = [{ id: 'name', label: 'Razón social', sourceLocation: 'Fuente, página 1', allowNotApplicable: false }];
const props = { caseId: 'case-a', manifestSha256: 'a'.repeat(64), inventory };
function file(content: string, name = 'demo.pdf') {
  const result = new File([content], name, { type: 'application/pdf' });
  Object.defineProperty(result, 'arrayBuffer', { value: async () => new TextEncoder().encode(content).buffer });
  return result;
}
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network allowed'); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function selectPdf(content = '%PDF-1.7\nsynthetic-only') {
  fireEvent.change(screen.getByLabelText(/PDF local/), { target: { files: [file(content)] } });
  await waitFor(() => expect(screen.getByLabelText('Resultado')).toBeEnabled());
}
function review() {
  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'verified' } });
  fireEvent.change(screen.getByLabelText('Ubicación en el PDF'), { target: { value: 'Página 1, campo legal' } });
  fireEvent.change(screen.getByLabelText('Qué comprobó o por qué no aplica'), { target: { value: 'Nombre completo coincide con el soporte.' } });
}

it('requires a PDF and reasoned decisions; never invokes network or enables workflow', async () => {
  render(<ArtifactReviewPanel {...props} />);
  expect(screen.getByLabelText('Resultado')).toBeDisabled();
  await selectPdf();
  review();
  expect(screen.getByText(/Borrador de revisión completo/)).toBeVisible();
  expect(screen.getByText(/nunca habilita Operaciones/)).toBeVisible();
  expect(screen.queryByRole('option', { name: /No aplica/ })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves decisions for identical bytes but requires an explicit restart for a changed PDF', async () => {
  render(<ArtifactReviewPanel {...props} />);
  await selectPdf(); review();
  await selectPdf();
  expect(screen.getByText(/Borrador de revisión completo/)).toBeVisible();
  fireEvent.change(screen.getByLabelText(/PDF local/), { target: { files: [file('%PDF-1.7\nchanged bytes')] } });
  const restart = await screen.findByRole('button', { name: 'Iniciar revisión del archivo actual' });
  await waitFor(() => expect(restart).toBeEnabled());
  expect(screen.getByLabelText('Resultado')).toBeDisabled();
  expect(screen.queryByText(/Borrador de revisión completo/)).not.toBeInTheDocument();
  fireEvent.click(restart);
  expect(screen.getByLabelText('Resultado')).toHaveValue('pending');
  expect(screen.getByLabelText('Qué comprobó o por qué no aplica')).toHaveValue('');
});

it('blocks invalid files even when their extension says PDF', async () => {
  render(<ArtifactReviewPanel {...props} />);
  fireEvent.change(screen.getByLabelText(/PDF local/), { target: { files: [file('not a PDF')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer');
  expect(screen.getByLabelText('Resultado')).toBeDisabled();
});

it('invalidates a review when the request changes', async () => {
  const view = render(<ArtifactReviewPanel {...props} />);
  await selectPdf(); review();
  view.rerender(<ArtifactReviewPanel {...props} manifestSha256={'b'.repeat(64)} />);
  expect(screen.getByRole('alert')).toHaveTextContent('inventario cambió');
  expect(screen.getByLabelText('Resultado')).toBeDisabled();
});

it('does not let an older asynchronous file read replace the latest selection', async () => {
  render(<ArtifactReviewPanel {...props} />);
  let finish!: (bytes: ArrayBuffer) => void;
  const first = new File(['%PDF-1.7 slow'], 'slow.pdf');
  Object.defineProperty(first, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }) });
  fireEvent.change(screen.getByLabelText(/PDF local/), { target: { files: [first] } });
  await selectPdf();
  finish(new TextEncoder().encode('%PDF-1.7 older').buffer);
  await waitFor(() => expect(screen.getByText('demo.pdf')).toBeVisible());
  expect(screen.queryByText('slow.pdf')).not.toBeInTheDocument();
});
