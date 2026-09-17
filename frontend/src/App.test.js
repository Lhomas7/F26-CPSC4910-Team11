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

test('shows the logged-in account after session restoration', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => null })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authenticated: true,
        user: {
          id: 7,
          username: 'dana',
          name: 'Dana Whitfield',
          account_type: 'sponsor',
          company: 'Palmetto Freight',
        },
      }),
    });

  window.history.pushState({}, '', '/login');
  render(<App />);

  await screen.findByText('Logged in successfully');
  expect(screen.getByText('Palmetto Freight')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
});