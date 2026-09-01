import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HistoricalIntakePanel } from './HistoricalIntakePanel';

describe('HistoricalIntakePanel', () => {
  it('shows a bounded recovery trace and its three no-effect guards', () => {
    render(<HistoricalIntakePanel intake={{
      status: 'preview_only',
      query: 'in:inbox subject:"Salzillo" after:2026/08/09 before:2026/08/12',
      after_date: '2026-08-09',
      before_date: '2026-08-12',
      candidate_count: 1,
      duplicate_state: 'already_imported',
      checkpoint_unchanged: true,
      source_preserved: true,
      external_effects: false,
    }} />);
    expect(screen.getByRole('heading', { name: 'Bounded Gmail preflight' })).toBeInTheDocument();
    expect(screen.getByText('Already captured')).toBeInTheDocument();
    expect(screen.getByText('Source preserved')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint unchanged')).toBeInTheDocument();
    expect(screen.getByText('No external effects')).toBeInTheDocument();
  });

  it('renders nothing for a normal non-historical case', () => {
    const { container } = render(<HistoricalIntakePanel intake={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('verifies one exact candidate and shows an idempotent import receipt', async () => {
    const previewHistoricalGmailSearch = vi.fn(async () => ({
      query: 'in:inbox subject:"Salzillo" after:2026/08/09 before:2026/08/12',
      candidates: [{ candidate_id: 'salzillo_message_1', subject: 'PROCESO DE ALTA GRUPO SALZILLO', sender_domain: 'example.test', received_at: '2026-08-10T15:00:00.000Z', attachment_count: 1, duplicate_state: 'already_imported' as const }],
      checkpoint_unchanged: true as const, persisted: false as const, outbound_enabled: false as const,
    }));
    const importHistoricalGmailMessage = vi.fn(async () => ({
      candidate_id: 'salzillo_message_1', claim_id: '97000000-0000-4000-8000-000000000001', import_status: 'replayed' as const,
      attachment_metadata_rows: 0, osp_enqueued: 0, osp_processed: 0, checkpoint_unchanged: true as const,
      source_preserved: true as const, persisted: true as const, outbound_enabled: false as const,
    }));
    render(<HistoricalIntakePanel subject="PROCESO DE ALTA GRUPO SALZILLO" client={{ previewHistoricalGmailSearch, importHistoricalGmailMessage }} intake={{
      status: 'preview_only', query: 'in:inbox subject:"Salzillo" after:2026/08/09 before:2026/08/12', after_date: '2026-08-09', before_date: '2026-08-12', candidate_count: 1,
      duplicate_state: 'already_imported', checkpoint_unchanged: true, source_preserved: true, external_effects: false,
    }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Verify exact candidate' }));
    expect(await screen.findByText('PROCESO DE ALTA GRUPO SALZILLO')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /import only this verified/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Verify idempotent replay' }));
    expect(await screen.findByText('Replay verified — already captured')).toBeInTheDocument();
    expect(importHistoricalGmailMessage).toHaveBeenCalledOnce();
  });
});
