import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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

const history = [
  { id: 2, driver: 7, driver_name: 'Jamie Rivera', point_change: -10, reason: 'Late log', changed_by_name: 'Pat Sponsor', changed_at: '2026-10-05T12:00:00Z' },
  { id: 1, driver: 7, driver_name: 'Jamie Rivera', point_change: 135, reason: 'Clean inspection', changed_by_name: 'Pat Sponsor', changed_at: '2026-10-01T12:00:00Z' },
];

function DriversListStub() {
  return <p>{useLocation().state?.notice}</p>;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/drivers/7']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/drivers/:driverId" element={<DriverDetailPage />} />
        <Route path="/drivers" element={<DriversListStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.getDriver.mockResolvedValue(driver);
  api.getPointHistory.mockResolvedValue(history);
});

afterEach(() => jest.clearAllMocks());

test('shows sponsor controls, the current balance and the point history', async () => {
  renderDetail();

  expect(await screen.findByRole('heading', { name: 'Jamie Rivera' })).toBeInTheDocument();
  expect(screen.getByLabelText('Current balance: 125 points')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Adjust points' })).toBeInTheDocument();
  expect(await screen.findByText('Late log')).toBeInTheDocument();
  expect(screen.getByText('Clean inspection')).toBeInTheDocument();
  expect(api.getPointHistory).toHaveBeenCalledWith({ driver: '7' });
});

test('does not offer adjustments until a pending driver is approved', async () => {
  api.getDriver.mockResolvedValue({ ...driver, status: 'pending', point_balance: 0 });
  renderDetail();

  expect(await screen.findByRole('button', { name: 'Approve Driver' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Adjust points' })).not.toBeInTheDocument();
});

test('approves a pending driver through the dedicated action', async () => {
  api.getDriver.mockResolvedValue({ ...driver, status: 'pending', point_balance: 0 });
  api.approveDriver.mockResolvedValue({ ...driver, status: 'approved', point_balance: 0 });
  renderDetail();

  fireEvent.click(await screen.findByRole('button', { name: 'Approve Driver' }));

  await waitFor(() => expect(api.approveDriver).toHaveBeenCalledWith('7'));
  expect(await screen.findByRole('heading', { name: 'Adjust points' })).toBeInTheDocument();
});

test('shows point history failures and allows retrying', async () => {
  api.getPointHistory.mockRejectedValueOnce(new Error('History service unavailable'));
  renderDetail();

  expect(await screen.findByText('History service unavailable')).toBeInTheDocument();
  api.getPointHistory.mockResolvedValueOnce(history);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('Late log')).toBeInTheDocument();
  expect(api.getPointHistory).toHaveBeenCalledTimes(2);
});

test('rejecting a pending driver requires a reason and returns to the list', async () => {
  api.getDriver.mockResolvedValue({ ...driver, status: 'pending', point_balance: 0 });
  api.removeDriver.mockResolvedValue({ id: 1, driver: 7, action: 'rejected', reason: 'Missing CDL' });
  renderDetail();

  fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reject driver' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a reason for rejecting this driver.');
  expect(api.removeDriver).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Reason for rejecting'), { target: { value: 'Missing CDL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reject driver' }));

  await waitFor(() => expect(api.removeDriver).toHaveBeenCalledWith(7, 'Missing CDL'));
  expect(await screen.findByText('Jamie Rivera was rejected. The reason has been saved.')).toBeInTheDocument();
});

test('dropping an approved driver shows server reason errors', async () => {
  api.removeDriver.mockRejectedValue(Object.assign(new Error('Bad request'), {
    data: { reason: ['Reasons must be 500 characters or fewer.'] },
  }));
  renderDetail();

  fireEvent.click(await screen.findByRole('button', { name: 'Drop driver' }));
  fireEvent.change(screen.getByLabelText('Reason for dropping'), { target: { value: 'Too long' } });
  fireEvent.click(screen.getByRole('button', { name: 'Drop from organization' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Reasons must be 500 characters or fewer.');
});
