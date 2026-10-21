import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { AppRoutes } from './AppRoutes';
import { navItemsFor } from './navigation';

jest.mock('../auth/AuthContext');
// Isolate route authorization from shell menus and unrelated dashboard requests.
jest.mock('./AppLayout', () => {
  const { Outlet } = require('react-router-dom');
  return { AppLayout: () => <Outlet /> };
});
jest.mock('../features/authentication', () => ({
  LoginPage: () => <h1>Sign in</h1>,
  ForgotPasswordPage: () => null,
  ResetPasswordPage: () => null,
  AdminResetPasswordPage: () => null,
}));

function renderCatalog(user, loading = false) {
  useAuth.mockReturnValue({ user, loading });
  render(
    <MemoryRouter
      initialEntries={['/catalog']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test.each(['driver', 'sponsor'])('%s can open the unlinked catalog foundation', (role) => {
  renderCatalog({ account_type: role });
  expect(screen.getByRole('heading', { level: 1, name: 'Catalog' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Catalog is not available yet' })).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByText(role === 'sponsor'
    ? /Product management is being prepared/
    : /Reward browsing is being prepared/)).toBeInTheDocument();
});

test('signed-out visitors are redirected to sign in', () => {
  renderCatalog(null);
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument();
});

test.each(['admin', 'unknown'])('%s cannot open catalog as their own role', (role) => {
  renderCatalog({ account_type: role });
  expect(screen.getByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument();
});

test('waits for authentication before rendering the catalog', () => {
  renderCatalog(null, true);
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument();
});

test.each(['driver', 'sponsor'])('View-As uses the effective %s role', (role) => {
  renderCatalog({ account_type: role, impersonation: { active: true, admin: { id: 1 } } });
  expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
});

test('catalog remains absent from every sidebar until the feature is usable', () => {
  for (const user of [null, ...['driver', 'sponsor', 'admin'].map((account_type) => ({ account_type }))]) {
    expect(navItemsFor(user).some((item) => item.to === '/catalog')).toBe(false);
  }
});
