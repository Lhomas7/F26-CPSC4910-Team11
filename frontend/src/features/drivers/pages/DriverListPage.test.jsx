import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import DriverListPage from './DriverListPage';

jest.mock('../../../api');
jest.mock('../../../auth/AuthContext');

const drivers = [
  { id: 4, name: 'Jamie Rivera', status: 'approved', point_balance: 125 },
  { id: 8, name: 'Morgan Chen', status: 'pending', point_balance: 0 },
];

function renderPage() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DriverListPage /></MemoryRouter>);
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor', company: 'Palmetto Freight' } });
  api.getDrivers.mockResolvedValue(drivers);
  api.getSponsorMfaSetting.mockResolvedValue({ driver_mfa_required: false });
});

afterEach(() => jest.clearAllMocks());

test('shows an understandable sponsor overview with explicit driver links', async () => {
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Driver directory' })).toBeInTheDocument();
  expect(screen.getByText('125', { selector: '.drivers-summary strong' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Jamie Rivera' })).toHaveAttribute('href', '/drivers/4');
  expect(screen.getByRole('link', { name: 'View Morgan Chen' })).toHaveAttribute('href', '/drivers/8');
  expect(screen.getByRole('heading', { name: 'Link a driver' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Driver security' })).toBeInTheDocument();
});

test('searches by driver name and filters enrollment status', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Driver directory' });

  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: 'Jamie' } });
  expect(screen.getByRole('link', { name: 'View Jamie Rivera' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'View Morgan Chen' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Pending 1/ }));
  expect(screen.queryByRole('link', { name: 'View Jamie Rivera' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Morgan Chen' })).toBeInTheDocument();
});

test('gives an empty sponsor a clear next action', async () => {
  api.getDrivers.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByRole('heading', { name: 'No drivers linked yet' })).toBeInTheDocument();
  expect(screen.getByLabelText('Driver username')).toBeInTheDocument();
});

test('shows an error state and retries loading', async () => {
  api.getDrivers.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(drivers);
  renderPage();

  expect(await screen.findByRole('heading', { name: "Drivers couldn't be loaded" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(api.getDrivers).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('heading', { name: 'Driver directory' })).toBeInTheDocument();
});

test('keeps sponsor-only management panels hidden from drivers', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  api.getDrivers.mockResolvedValue([drivers[0]]);
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Driver record' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Link a driver' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Driver security' })).not.toBeInTheDocument();
});
