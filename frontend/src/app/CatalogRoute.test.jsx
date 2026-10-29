import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { createProduct, getCatalog } from '../api/catalog';
import { AppRoutes } from './AppRoutes';
import { navItemsFor } from './navigation';

jest.mock('../auth/AuthContext');
jest.mock('../api/catalog');
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

function renderCatalog(user, loading = false, path = '/catalog') {
  useAuth.mockReturnValue({ user, loading });
  render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
  getCatalog.mockReset();
  createProduct.mockReset();
  getCatalog.mockReturnValue(new Promise(() => {}));
});

test('driver route loads the real catalog without Sponsor actions', () => {
  renderCatalog({ account_type: 'driver' });
  expect(screen.getByRole('heading', { level: 1, name: 'Catalog' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Loading catalog' })).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(getCatalog).toHaveBeenCalledWith(1);
});

test('sponsor route loads the real catalog', () => {
  renderCatalog({ account_type: 'sponsor' });
  expect(screen.getByRole('heading', { level: 1, name: 'Catalog' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Loading catalog' })).toBeInTheDocument();
  expect(getCatalog).toHaveBeenCalledWith(1);
});

test('signed-out visitors are redirected to sign in', () => {
  renderCatalog(null);
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument();
});

test.each(['admin', 'unknown'])('%s cannot open catalog as their own role', (role) => {
  renderCatalog({ account_type: role });
  expect(
    screen.getByRole('heading', { name: "You don't have access to this page" }),
  ).toBeInTheDocument();
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

test('catalog is linked for Drivers and Sponsors only', () => {
  expect(navItemsFor({ account_type: 'sponsor' }).some((item) => item.to === '/catalog')).toBe(
    true,
  );
  expect(navItemsFor({ account_type: 'driver' }).some((item) => item.to === '/catalog')).toBe(true);
  for (const user of [null, { account_type: 'admin' }]) {
    expect(navItemsFor(user).some((item) => item.to === '/catalog')).toBe(false);
  }
});

test.each(['driver', 'admin'])('%s cannot open the Add Product route', (role) => {
  renderCatalog({ account_type: role }, false, '/catalog/new');
  expect(
    screen.getByRole('heading', { name: "You don't have access to this page" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Product name')).not.toBeInTheDocument();
});

test('Sponsor View-As can open Add Product without automatically posting', () => {
  renderCatalog(
    { account_type: 'sponsor', impersonation: { active: true, admin: { id: 1 } } },
    false,
    '/catalog/new',
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Add product' })).toBeInTheDocument();
  expect(createProduct).not.toHaveBeenCalled();
});

test('signed-out visitors cannot open Add Product', () => {
  renderCatalog(null, false, '/catalog/new');
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});
