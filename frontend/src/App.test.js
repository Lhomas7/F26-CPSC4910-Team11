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
    company: 'Palmetto Freight',
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

  const indicator = await screen.findByRole('region', { name: 'Viewing as another user' });
  expect(indicator).toHaveTextContent('Viewing as');
  expect(indicator).toHaveTextContent('Drew Driver');
  expect(indicator).toHaveTextContent('@driver.target');
  expect(indicator).toHaveTextContent('Driver');
  expect(indicator).toHaveTextContent('Palmetto Freight');
  expect(indicator).toHaveTextContent('Signed in as Avery Admin');

  fireEvent.click(screen.getByRole('button', { name: 'Profile menu for Drew Driver' }));
  let profileMenu = screen.getByRole('menu');
  expect(within(profileMenu).getByText('Viewing as')).toBeInTheDocument();
  expect(within(profileMenu).getByText('Signed in as')).toBeInTheDocument();
  expect(within(profileMenu).getByText('@admin.viewer')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Return to administrator account' }));

  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'Viewing as another user' }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Profile menu for Avery Admin' }));
  profileMenu = screen.getByRole('menu');
  expect(within(profileMenu).getByText('Avery Admin')).toBeInTheDocument();
  expect(within(profileMenu).getByText('@admin.viewer')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account');
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/admin/impersonation/stop/'),
    expect.objectContaining({ method: 'POST' }),
  );
});
