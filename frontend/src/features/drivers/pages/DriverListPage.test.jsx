import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import DriverListPage from './DriverListPage';

jest.mock('../../../api');
jest.mock('../../../auth/AuthContext');

const drivers = [
  { id: 4, username: 'jamie.rivera', name: 'Jamie Rivera', status: 'approved', point_balance: 125 },
  { id: 8, username: 'morgan.chen', name: 'Morgan Chen', status: 'pending', point_balance: 0 },
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

test('shows the sponsor overview, visible usernames, and whole-card driver links', async () => {
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Driver directory' })).toBeInTheDocument();
  expect(screen.getByText('125', { selector: '.drivers-summary strong' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Jamie Rivera' })).toHaveAttribute('href', '/drivers/4');
  expect(screen.getByRole('link', { name: 'View Morgan Chen' })).toHaveAttribute('href', '/drivers/8');
  expect(screen.getByText('@jamie.rivera')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Link driver' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Organization driver settings' })).toBeInTheDocument();
});

test('searches by driver name and filters enrollment status', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Driver directory' });

  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: 'Jamie' } });
  expect(screen.getByRole('link', { name: 'View Jamie Rivera' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'View Morgan Chen' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /^Pending 1$/ }));
  expect(screen.queryByRole('link', { name: 'View Jamie Rivera' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Morgan Chen' })).toBeInTheDocument();
});

test('searches by driver username without case sensitivity', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Driver directory' });

  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: 'MORGAN.CHEN' } });

  expect(screen.queryByRole('link', { name: 'View Jamie Rivera' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Morgan Chen' })).toBeInTheDocument();
});

test('gives an empty sponsor a clear next action', async () => {
  api.getDrivers.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByRole('heading', { name: 'No drivers linked yet' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Link driver' }));
  expect(screen.getByRole('dialog', { name: 'Link a driver' })).toBeInTheDocument();
  expect(screen.getByLabelText('Driver username')).toBeInTheDocument();
});

test('uses summary cards as synchronized status filters', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Driver directory' });

  fireEvent.click(screen.getByRole('button', { name: /Pending 1 Show pending only/ }));

  expect(screen.queryByRole('link', { name: 'View Jamie Rivera' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Morgan Chen' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Pending 1/ })).toHaveLength(2);
  screen.getAllByRole('button', { name: /Pending 1/ }).forEach((button) => {
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
  expect(screen.getByText('Showing 1 of 2 drivers')).toBeInTheDocument();
});

test('links a driver from the modal and announces the pending enrollment', async () => {
  const linkedDriver = { id: 12, username: 'alex.moreno', name: 'Alex Moreno', status: 'pending', point_balance: 0 };
  api.getDrivers.mockResolvedValueOnce(drivers).mockResolvedValueOnce([...drivers, linkedDriver]);
  api.linkDriver.mockResolvedValue(linkedDriver);
  renderPage();
  await screen.findByRole('heading', { name: 'Driver directory' });

  fireEvent.click(screen.getByRole('button', { name: 'Link driver' }));
  fireEvent.change(screen.getByLabelText('Driver username'), { target: { value: '  alex.moreno  ' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Link driver' }));

  await waitFor(() => expect(api.linkDriver).toHaveBeenCalledWith('alex.moreno'));
  expect(await screen.findByRole('status')).toHaveTextContent(
    '@alex.moreno was linked to Palmetto Freight and is waiting for approval.',
  );
  expect(screen.getByRole('link', { name: 'View Alex Moreno' })).toBeInTheDocument();
});

test('shows an error state and retries loading', async () => {
  api.getDrivers.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(drivers);
  renderPage();

  expect(await screen.findByRole('heading', { name: "Drivers couldn't be loaded" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(api.getDrivers).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('heading', { name: 'Driver directory' })).toBeInTheDocument();
});
