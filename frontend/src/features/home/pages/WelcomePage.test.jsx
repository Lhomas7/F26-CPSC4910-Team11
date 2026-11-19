import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from 'api';
import { useAuth } from 'auth/AuthContext';
import { ActiveSponsorProvider } from 'features/sponsors';
import WelcomePage from './WelcomePage';

jest.mock('api');
jest.mock('auth/AuthContext');

const recent = [
  {
    id: 1,
    driver: 4,
    driver_name: 'Jamie Rivera',
    point_change: 50,
    reason: 'Clean inspection',
    changed_by_name: 'Pat Sponsor',
    changed_at: '2026-10-01T12:00:00Z',
  },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: null });
  api.getDrivers.mockResolvedValue([]);
  api.getMySponsors.mockResolvedValue({ active_sponsor_id: null, memberships: [] });
  api.getPointHistory.mockResolvedValue([]);
  api.getAdminUsers.mockResolvedValue([]);
  api.getAdminSponsorOrganizations.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

/** As in the app shell, only drivers have the sponsor context. */
function renderWelcomePage({ asDriver = false } = {}) {
  const page = asDriver ? (
    <ActiveSponsorProvider>
      <WelcomePage />
    </ActiveSponsorProvider>
  ) : (
    <WelcomePage />
  );
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {page}
    </MemoryRouter>,
  );
}

test('renders the welcome copy and anonymous CTAs', () => {
  renderWelcomePage();

  expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
    'href',
    '/login?tab=register',
  );
  expect(screen.queryByRole('link', { name: 'Go to drivers' })).not.toBeInTheDocument();
});

test('greets a signed-in user by name', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  renderWelcomePage({ asDriver: true });

  expect(
    screen.getByRole('heading', { level: 2, name: 'Welcome back, Jamie Rivera' }),
  ).toBeInTheDocument();
  expect(await screen.findByText("You aren't with any sponsor yet.")).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Apply to a sponsor' })).toHaveAttribute(
    'href',
    '/sponsors',
  );
  expect(screen.queryByText(/rewards truck drivers for driving well/i)).not.toBeInTheDocument();
});

test('a sponsor gets role-specific driver and points actions', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Ava Chen', username: 'ava.chen', account_type: 'sponsor' },
  });
  renderWelcomePage();

  expect(screen.getByRole('link', { name: 'Go to drivers' })).toHaveAttribute('href', '/drivers');
  expect(screen.getByRole('link', { name: 'View points' })).toHaveAttribute('href', '/points');
  expect(await screen.findByText('No drivers are waiting.')).toBeInTheDocument();
});

test('a driver sees each sponsor separately, with no combined total, and recent activity', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  api.getMySponsors.mockResolvedValue({
    active_sponsor_id: 3,
    memberships: [
      { sponsor: { id: 3, name: 'Palmetto Freight' }, status: 'approved', point_balance: 50 },
      { sponsor: { id: 5, name: 'Upstate Logistics' }, status: 'approved', point_balance: 1200 },
      { sponsor: { id: 7, name: 'Coastal Carriers' }, status: 'pending' },
    ],
  });
  api.getPointHistory.mockResolvedValue(recent);
  renderWelcomePage({ asDriver: true });

  expect(screen.queryByRole('link', { name: 'Go to drivers' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View all points' })).toHaveAttribute('href', '/points');
  expect(screen.getByRole('link', { name: 'Apply to more sponsors' })).toHaveAttribute(
    'href',
    '/sponsors',
  );
  expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account');
  const standings = await screen.findByRole('region', { name: 'Your sponsors' });
  expect(standings).toHaveTextContent('Palmetto Freight50 pts');
  expect(standings).toHaveTextContent('Upstate Logistics1,200 pts');
  expect(standings).toHaveTextContent('Coastal CarriersPending approval');
  expect(screen.getByText('Shopping now')).toBeInTheDocument();
  expect(screen.queryByText(/across every sponsor/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/1,250/)).not.toBeInTheDocument();
  expect(screen.getByText('Clean inspection')).toBeInTheDocument();
  expect(api.getPointHistory).toHaveBeenCalledWith({ limit: 5 });
  expect(api.getDrivers).not.toHaveBeenCalled();
});

test('a driver whose applications are all pending is told who must approve them', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  api.getMySponsors.mockResolvedValue({
    active_sponsor_id: null,
    memberships: [{ sponsor: { id: 3, name: 'Palmetto Freight' }, status: 'pending' }],
  });
  renderWelcomePage({ asDriver: true });

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Palmetto Freight must approve your application',
  );
});

test('a sponsor dashboard lists pending applications and recent driver activity', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Ava Chen', username: 'ava.chen', account_type: 'sponsor' },
  });
  api.getDrivers.mockResolvedValue([
    { id: 4, name: 'Jamie Rivera', status: 'approved', point_balance: 50 },
    { id: 8, name: 'Morgan Chen', status: 'pending', point_balance: 0 },
  ]);
  api.getPointHistory.mockResolvedValue(recent);
  renderWelcomePage();

  expect(await screen.findByRole('link', { name: 'Review Morgan Chen' })).toHaveAttribute(
    'href',
    '/drivers/8',
  );
  expect(screen.getByText('Clean inspection')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Jamie Rivera' })).toHaveAttribute('href', '/drivers/4');
});

test('an admin gets account counts and shortcuts', async () => {
  useAuth.mockReturnValue({
    user: { name: 'Sam Admin', username: 'sam.admin', account_type: 'admin' },
  });
  api.getAdminUsers.mockResolvedValue([
    { id: 1, role: 'driver', sponsor_org: null, is_active: false },
    { id: 2, role: 'driver', sponsor_org: { id: 3 }, is_active: true },
    { id: 3, role: 'sponsor', is_active: true },
    { id: 4, role: 'admin', is_active: true },
  ]);
  api.getAdminSponsorOrganizations.mockResolvedValue([{ id: 3, name: 'Palmetto Freight' }]);
  renderWelcomePage();

  expect(screen.getByRole('link', { name: 'Manage users' })).toHaveAttribute('href', '/users');
  expect(await screen.findByText('Drivers without a sponsor')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add user' })).toHaveAttribute('href', '/users/new');
  expect(screen.getByText('Inactive accounts')).toBeInTheDocument();
  expect(screen.getByText('Sponsor organizations')).toBeInTheDocument();
  expect(api.getDrivers).not.toHaveBeenCalled();
});
