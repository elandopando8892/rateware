import { render, screen } from '@testing-library/react';
import { App } from './App';

test('identifies OSP as XBF customer setup and contains no iframe', () => {
  const { container } = render(<App />);
  expect(screen.getByRole('heading', { name: /customer setup/i })).toBeVisible();
  expect(screen.getByText(/xBF as the provider's customer/i)).toBeVisible();
  expect(container.querySelector('iframe')).toBeNull();
});
