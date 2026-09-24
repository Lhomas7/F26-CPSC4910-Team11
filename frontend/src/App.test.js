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

test('renders the welcome page at / for an unauthenticated visitor', async () => {
  render(<App />);

  expect(await screen.findByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
});

test('redirects an unauthenticated user to the login page when visiting /drivers', async () => {
  window.history.pushState({}, '', '/drivers');
  render(<App />);

  await screen.findByRole('heading', { name: /sign in/i });
  expect(window.location.pathname).toBe('/login');
});