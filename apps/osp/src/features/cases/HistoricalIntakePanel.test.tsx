import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
});
