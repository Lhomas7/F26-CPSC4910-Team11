import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from 'api';
import { useAuth } from 'auth/AuthContext';
import PointsPage from './PointsPage';

jest.mock('api');
jest.mock('auth/AuthContext');

const history = [
  {
    id: 2,
    driver: 4,
    driver_name: 'Jamie Rivera',
    point_change: -10,
    reason: 'Late log',
    changed_by_name: 'Pat Sponsor',
    changed_at: '2026-10-05T12:00:00Z',
  },
  {
    id: 1,
    driver: 4,
    driver_name: 'Jamie Rivera',
    point_change: 135,
    reason: 'Clean inspection',
    changed_by_name: 'Pat Sponsor',
    changed_at: '2026-10-01T12:00:00Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PointsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => api.getBehaviors.mockResolvedValue([]));
afterEach(() => jest.clearAllMocks());

test('drivers see their balance, sponsor and full history with reasons', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  api.getDrivers.mockResolvedValue([
    {
      id: 4,
      name: 'Jamie Rivera',
      username: 'jamie.rivera',
      status: 'approved',
      point_balance: 125,
      sponsor_name: 'Palmetto Freight',
    },
  ]);
  api.getPointHistory.mockResolvedValue(history);
  renderPage();

  expect(await screen.findByText('Palmetto Freight')).toBeInTheDocument();
  expect(screen.getByText('Approved')).toBeInTheDocument();
  expect(screen.getByText('125')).toBeInTheDocument();
  expect(screen.getByText('Late log')).toBeInTheDocument();
  expect(screen.getByText('Deduction')).toBeInTheDocument();
  expect(screen.getByText('Award')).toBeInTheDocument();
  expect(screen.getByText('−10')).toBeInTheDocument();
  expect(screen.getByText('+135')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show history for' })).not.toBeInTheDocument();
});

test('sponsors see recent activity across drivers and can narrow it to one', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.getDrivers.mockResolvedValue([
    {
      id: 4,
      name: 'Jamie Rivera',
      username: 'jamie.rivera',
      status: 'approved',
      point_balance: 125,
    },
    {
      id: 8,
      name: 'Morgan Chen',
      username: 'morgan.chen',
      status: 'pending',
      point_balance: 0,
    },
  ]);
  api.getPointHistory.mockResolvedValue(history);
  renderPage();

  expect(
    await screen.findByRole('heading', { name: 'Recent activity across your organization' }),
  ).toBeInTheDocument();
  expect((await screen.findAllByRole('link', { name: 'Jamie Rivera' }))[0]).toHaveAttribute(
    'href',
    '/drivers/4',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Viewing point activity for' }));
  fireEvent.click(screen.getByRole('option', { name: /Jamie Rivera/ }));

  await waitFor(() =>
    expect(api.getPointHistory).toHaveBeenLastCalledWith({ driver: '4', limit: 25 }),
  );
  expect(
    await screen.findByRole('heading', { name: "Jamie Rivera's point history" }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Award or deduct points' })).toHaveAttribute(
    'href',
    '/drivers/4',
  );
});

const driverRecord = {
  id: 4,
  name: 'Jamie Rivera',
  username: 'jamie.rivera',
  status: 'approved',
  point_balance: 125,
  sponsor_name: 'Palmetto Freight',
};

test("drivers see their sponsor's good and bad behaviors in their standing", async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  api.getDrivers.mockResolvedValue([driverRecord]);
  api.getPointHistory.mockResolvedValue([]);
  api.getBehaviors.mockResolvedValue([
    { id: 1, kind: 'bad', description: 'Hard braking', point_value: 50, signed_points: -50 },
    {
      id: 2,
      kind: 'good',
      description: 'On-time delivery',
      point_value: 1500,
      signed_points: 1500,
    },
  ]);
  renderPage();

  const standing = await screen.findByRole('region', { name: 'Program standing' });
  const earns = await within(standing).findByRole('region', { name: 'Earns points' });
  expect(within(earns).getByText('On-time delivery')).toBeInTheDocument();
  expect(within(earns).getByText('+1,500 pts')).toBeInTheDocument();
  const costs = within(standing).getByRole('region', { name: 'Costs points' });
  expect(within(costs).getByText('Hard braking')).toBeInTheDocument();
  expect(within(costs).getByText('−50 pts')).toBeInTheDocument();
});

test('drivers are told when their sponsor has not listed behaviors', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  api.getDrivers.mockResolvedValue([driverRecord]);
  api.getPointHistory.mockResolvedValue([]);
  renderPage();

  expect(
    await screen.findByText("Palmetto Freight hasn't listed example behaviors yet."),
  ).toBeInTheDocument();
});

test('drivers without a sponsor see no behavior section', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  api.getDrivers.mockResolvedValue([{ ...driverRecord, sponsor_name: null, status: 'pending' }]);
  api.getPointHistory.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByText('Not linked to a sponsor')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'How points change' })).not.toBeInTheDocument();
});
