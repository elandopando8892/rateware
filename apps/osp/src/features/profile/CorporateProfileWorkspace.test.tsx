import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CorporateProfileWorkspace } from './CorporateProfileWorkspace';

describe('CorporateProfileWorkspace', () => {
  it('shows a dual-entity profile without exposing production identifiers', async () => {
    render(<CorporateProfileWorkspace />);
    expect(screen.getByRole('heading', { name: /corporate profile/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /xbf demo logistics/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent/i)).toBeInTheDocument();
    expect(screen.getByText(/verified corporate name/i)).toBeInTheDocument();
    expect(screen.getByText('••••••••••••')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /united states entity/i }));
    expect(screen.getByRole('heading', { name: /xbf demo freight systems/i })).toBeInTheDocument();
    expect(screen.getByText('••-•••••••')).toBeInTheDocument();
    expect(screen.getByText(/signature specimen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/withheld/i).length).toBeGreaterThan(0);
  });
});
