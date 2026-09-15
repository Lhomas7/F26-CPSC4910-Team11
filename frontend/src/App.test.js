import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('provides About and Sign in links in the primary navigation', async () => {
  render(<App />);

  await screen.findByText('No drivers assigned yet.');
  expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});
