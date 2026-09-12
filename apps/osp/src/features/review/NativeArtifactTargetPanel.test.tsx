import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { NativeArtifactTargetPanel } from './NativeArtifactTargetPanel';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = {
  state: 'missing' as const, mappingId: id(1), mappingVersion: 2, mappingSha256: 'a'.repeat(64),
  mappingDecisionId: id(2), sourceVersionId: id(3), sourceSha256: 'b'.repeat(64),
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const,
  sourceDownloadUrl: 'https://example.test/original.docx', requiredFieldCount: 1, mappedFieldCount: 0,
  completionPercent: 0, fields: [{ canonicalFieldId: 'company.name', label: 'Legal name', target: null }],
};

afterEach(cleanup);

it('requires the preserved original and 100% native coverage before one save', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<NativeArtifactTargetPanel caseId={id(4)} caseState="operations_review" review={base} onSave={save} />);
  const action = screen.getByRole('button', { name: 'Save reviewed destinations' });
  expect(action).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Content control tag'), { target: { value: 'company.name' } });
  await userEvent.click(screen.getByRole('checkbox', { name: /confirm 100% coverage/i }));
  await userEvent.click(action);
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0]).toMatchObject({
    mappingId: base.mappingId, expectedMappingVersion: 2, expectedSourceVersionId: base.sourceVersionId,
    targets: [{ kind: 'content_control', canonicalFieldId: 'company.name', targetTag: 'company.name' }],
  });
});

it('blocks stale and ambiguous reviews without exposing editable destinations', () => {
  const save = vi.fn();
  const view = render(<NativeArtifactTargetPanel caseId={id(4)} caseState="operations_review" review={{ ...base, state: 'stale' }} onSave={save} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/changed/i);
  expect(screen.getByLabelText('Content control tag')).toBeDisabled();
  view.rerender(<NativeArtifactTargetPanel caseId={id(4)} caseState="operations_review" review={{ ...base, state: 'ambiguous' }} onSave={save} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/more than one/i);
  expect(save).not.toHaveBeenCalled();
});

it('retains reviewed PDF overlay placement without asking Operations to invent coordinates', () => {
  const overlay = { kind: 'overlay' as const, canonicalFieldId: 'company.name', page: 2, x: 10, y: 20, width: 100, height: 14, fontSize: 10 };
  const review: NonNullable<ApprovalCommunicationsWorkspace['nativeArtifactTargets']>[number] = {
    ...base, state: 'ready', contentType: 'application/pdf', mappedFieldCount: 1, completionPercent: 100,
    fields: [{ ...base.fields[0], target: overlay }],
  };
  render(<NativeArtifactTargetPanel caseId={id(4)} caseState="operations_review" review={review} onSave={vi.fn()} />);
  expect(screen.getByText(/retained on page 2/i)).toBeVisible();
  expect(screen.queryByLabelText('Destination type')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/coordinate|width|height|font size/i)).not.toBeInTheDocument();
});

it('reload shows the new mapping version and preparing state as persisted', () => {
  render(<NativeArtifactTargetPanel caseId={id(4)} caseState="preparing" review={{
    ...base, state: 'persisted', mappingVersion: 3, mappedFieldCount: 1, completionPercent: 100,
    fields: [{ ...base.fields[0], target: { kind: 'content_control', canonicalFieldId: 'company.name', targetTag: 'company.name' } }],
  }} onSave={vi.fn()} />);
  expect(screen.getByText(/Mapping v3 is saved/)).toHaveAttribute('role', 'status');
  expect(screen.queryByRole('button', { name: 'Save reviewed destinations' })).not.toBeInTheDocument();
});
