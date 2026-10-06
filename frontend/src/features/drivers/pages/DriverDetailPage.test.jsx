import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../../../auth/AuthContext';
import * as api from '../../../api';
import DriverDetailPage from './DriverDetailPage';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../api');

const driver = {
  id: 7,
  user: 12,
  name: 'Jamie Rivera',
  sponsor: 3,
  status: 'approved',
  point_balance: 125,
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/drivers/7']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/drivers/:driverId" element={<DriverDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.getDriver.mockResolvedValue(driver);
});

afterEach(() => jest.clearAllMocks());

test('shows sponsor controls and the current driver balance', async () => {
  renderDetail();

  expect(await screen.findByRole('heading', { name: 'Jamie Rivera' })).toBeInTheDocument();
  expect(screen.getByLabelText('Current balance: 125 points')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Adjust points' })).toBeInTheDocument();
});

test('does not show adjustment controls to a driver viewing their record', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderDetail();

  expect(await screen.findByText('125 pts')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Adjust points' })).not.toBeInTheDocument();
});

test('does not offer adjustments until a pending driver is approved', async () => {
  api.getDriver.mockResolvedValue({ ...driver, status: 'pending', point_balance: 0 });
  renderDetail();

  expect(await screen.findByRole('button', { name: 'Approve Driver' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Adjust points' })).not.toBeInTheDocument();
});
