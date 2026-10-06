import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../api';
import { useAuth } from '../../auth/AuthContext';
import WelcomePage from './WelcomePage';

jest.mock('../../api');
jest.mock('../../auth/AuthContext');

const recent = [
  { id: 1, driver: 4, driver_name: 'Jamie Rivera', point_change: 50, reason: 'Clean inspection', changed_by_name: 'Pat Sponsor', changed_at: '2026-10-01T12:00:00Z' },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: null });
  api.getDrivers.mockResolvedValue([]);
  api.getPointHistory.mockResolvedValue([]);
  api.getAdminUsers.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

function renderWelcomePage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WelcomePage />
    </MemoryRouter>,
  );
}

test('renders the welcome copy and anonymous CTAs', () => {
  renderWelcomePage();

  expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/login?tab=register');
  expect(screen.queryByRole('link', { name: 'Go to drivers' })).not.toBeInTheDocument();
});

test('greets a signed-in user by name', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  renderWelcomePage();

  expect(screen.getByRole('heading', { level: 2, name: 'Welcome back, Jamie Rivera' })).toBeInTheDocument();
  expect(await screen.findByText('Not linked yet')).toBeInTheDocument();
});

test('a sponsor gets the Go to drivers shortcut plus My account', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Ava Chen', username: 'ava.chen', account_type: 'sponsor' },
  });
  renderWelcomePage();

  expect(screen.getByRole('link', { name: 'Go to drivers' })).toHaveAttribute('href', '/drivers');
  expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account');
  expect(await screen.findByText('No applications waiting.')).toBeInTheDocument();
});

test('a driver gets a points shortcut and their balance with recent activity', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  api.getDrivers.mockResolvedValue([{ id: 4, name: 'Jamie Rivera', status: 'approved', point_balance: 50, sponsor_name: 'Palmetto Freight' }]);
  api.getPointHistory.mockResolvedValue(recent);
  renderWelcomePage();

  expect(screen.queryByRole('link', { name: 'Go to drivers' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View my points' })).toHaveAttribute('href', '/points');
  expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account');
  expect(await screen.findByText('Palmetto Freight')).toBeInTheDocument();
  expect(screen.getByText('Clean inspection')).toBeInTheDocument();
  expect(api.getPointHistory).toHaveBeenCalledWith({ limit: 5 });
});

test('a sponsor dashboard lists pending applications and recent driver activity', async () => {
  useAuth.mockReturnValue({ user: { name: 'Ava Chen', username: 'ava.chen', account_type: 'sponsor' } });
  api.getDrivers.mockResolvedValue([
    { id: 4, name: 'Jamie Rivera', status: 'approved', point_balance: 50 },
    { id: 8, name: 'Morgan Chen', status: 'pending', point_balance: 0 },
  ]);
  api.getPointHistory.mockResolvedValue(recent);
  renderWelcomePage();

  expect(await screen.findByRole('link', { name: 'Review Morgan Chen' })).toHaveAttribute('href', '/drivers/8');
  expect(screen.getByText('Clean inspection')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Jamie Rivera' })).toHaveAttribute('href', '/drivers/4');
});

test('an admin gets account counts and shortcuts', async () => {
  useAuth.mockReturnValue({ user: { name: 'Sam Admin', username: 'sam.admin', account_type: 'admin' } });
  api.getAdminUsers.mockResolvedValue([
    { id: 1, role: 'driver', sponsor_org: null },
    { id: 2, role: 'driver', sponsor_org: { id: 3 } },
    { id: 3, role: 'sponsor' },
    { id: 4, role: 'admin' },
  ]);
  renderWelcomePage();

  expect(screen.getByRole('link', { name: 'Manage users' })).toHaveAttribute('href', '/users');
  expect(await screen.findByText('Drivers without a sponsor')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add a user' })).toHaveAttribute('href', '/users/new');
  expect(api.getDrivers).not.toHaveBeenCalled();
});
