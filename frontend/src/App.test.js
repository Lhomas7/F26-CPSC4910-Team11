import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

test('shows an impersonation warning and returns to the administrator account', async () => {
  const impersonatedUser = {
    id: 12,
    username: 'driver.target',
    name: 'Drew Driver',
    account_type: 'driver',
    company: null,
    mfa: { required: false, enrolled: true, methods: [] },
    impersonation: {
      active: true,
      admin: { id: 1, username: 'admin.viewer', name: 'Avery Admin' },
    },
  };
  const adminUser = {
    id: 1,
    username: 'admin.viewer',
    name: 'Avery Admin',
    account_type: 'admin',
    company: null,
    mfa: { required: false, enrolled: false, methods: [] },
  };
  global.fetch = jest.fn((url) => {
    if (url.endsWith('/me/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ authenticated: true, user: impersonatedUser }),
      });
    }
    if (url.endsWith('/admin/impersonation/stop/')) {
      return Promise.resolve({ ok: true, json: async () => adminUser });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  render(<App />);

  expect(await screen.findByText(/Viewing as Drew Driver/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Return to admin account' }));

  await waitFor(() => expect(screen.queryByText(/Viewing as Drew Driver/)).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Profile menu for Avery Admin' }));
  const profileMenu = screen.getByRole('menu');
  expect(within(profileMenu).getByText('Avery Admin')).toBeInTheDocument();
  expect(within(profileMenu).getByText('@admin.viewer')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account');
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/admin/impersonation/stop/'),
    expect.objectContaining({ method: 'POST' }),
  );
});
