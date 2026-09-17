import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ authenticated: false }),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('redirects an unauthenticated user to the login page', async () => {
  render(<App />);

  await screen.findByRole('heading', { name: /sign in/i });
  expect(window.location.pathname).toBe('/login');
});