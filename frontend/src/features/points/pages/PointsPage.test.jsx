import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import PointsPage from './PointsPage';

jest.mock('../../../api');
jest.mock('../../../auth/AuthContext');

const history = [
  { id: 2, driver: 4, driver_name: 'Jamie Rivera', point_change: -10, reason: 'Late log', changed_by_name: 'Pat Sponsor', changed_at: '2026-10-05T12:00:00Z' },
  { id: 1, driver: 4, driver_name: 'Jamie Rivera', point_change: 135, reason: 'Clean inspection', changed_by_name: 'Pat Sponsor', changed_at: '2026-10-01T12:00:00Z' },
];

function renderPage() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PointsPage /></MemoryRouter>);
}

afterEach(() => jest.clearAllMocks());

test('drivers see their balance, sponsor and full history with reasons', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  api.getDrivers.mockResolvedValue([{ id: 4, name: 'Jamie Rivera', status: 'approved', point_balance: 125, sponsor_name: 'Palmetto Freight' }]);
  api.getPointHistory.mockResolvedValue(history);
  renderPage();

  expect(await screen.findByText('Sponsored by Palmetto Freight')).toBeInTheDocument();
  expect(screen.getByText('125')).toBeInTheDocument();
  expect(screen.getByText('Late log')).toBeInTheDocument();
  expect(screen.getByText('−10')).toBeInTheDocument();
  expect(screen.getByText('+135')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show history for' })).not.toBeInTheDocument();
});

test('sponsors see recent activity across drivers and can narrow it to one', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.getDrivers.mockResolvedValue([
    { id: 4, name: 'Jamie Rivera', status: 'approved', point_balance: 125 },
    { id: 8, name: 'Morgan Chen', status: 'pending', point_balance: 0 },
  ]);
  api.getPointHistory.mockResolvedValue(history);
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Recent activity' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Jamie Rivera' })[0]).toHaveAttribute('href', '/drivers/4');

  fireEvent.click(screen.getByRole('button', { name: 'Show history for' }));
  fireEvent.click(screen.getByRole('option', { name: 'Jamie Rivera' }));

  await waitFor(() => expect(api.getPointHistory).toHaveBeenLastCalledWith({ driver: '4' }));
  expect(await screen.findByRole('heading', { name: "Jamie Rivera's history" })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Award or deduct points' })).toHaveAttribute('href', '/drivers/4');
});
