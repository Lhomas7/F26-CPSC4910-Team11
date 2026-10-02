import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import DriverDetailPage from './DriverDetailPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

const account = { id: 5, display_name: 'Tasha Greene', username: 'tasha.driver', email: 'tasha@example.com', role: 'driver', sponsor_org: { id: 7, name: 'Palmetto Freight' }, is_active: true, profile_picture_url: null };
const organizations = [{ id: 7, name: 'Palmetto Freight' }, { id: 9, name: 'Blue Ridge Logistics' }];
const startImpersonation = jest.fn();

function renderPage() {
  return render(<MemoryRouter initialEntries={['/users/drivers/5']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/users/drivers/:userId" element={<DriverDetailPage />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' }, startImpersonation });
  startImpersonation.mockResolvedValue({ account_type: 'driver' });
  api.getAdminDriver.mockResolvedValue(account);
  api.getAdminSponsorOrganizations.mockResolvedValue(organizations);
});

afterEach(() => jest.clearAllMocks());

test('loads and displays driver account details', async () => {
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Loading driver account');
  expect(await screen.findByRole('heading', { name: 'Tasha Greene' })).toBeInTheDocument();
  expect(screen.getByText('tasha@example.com')).toBeInTheDocument();
  expect(screen.getByText('Palmetto Freight')).toBeInTheDocument();
  expect(screen.getByText('None uploaded')).toBeInTheDocument();
});

test('edits, unassigns, and deactivates a driver account', async () => {
  api.updateAdminDriver.mockResolvedValue({ ...account, display_name: 'Tasha Green', sponsor_org: null, is_active: false });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Tasha Green' } });
  fireEvent.change(screen.getByLabelText(/^Sponsor organization/), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText(/^Account status/), { target: { value: 'false' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.updateAdminDriver).toHaveBeenCalledWith('5', expect.objectContaining({ display_name: 'Tasha Green', sponsor_org_id: null, is_active: false })));
  expect(await screen.findByText('Driver account saved.')).toBeInTheDocument();
});

test('starts a view-as session for the driver', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'View as driver' }));
  await waitFor(() => expect(startImpersonation).toHaveBeenCalledWith('5'));
});

test('shows duplicate username errors while retaining edits', async () => {
  api.updateAdminDriver.mockRejectedValue({ data: { username: ['That username is already taken.'] } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'taken.user' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
  expect(screen.getByLabelText(/^Username/)).toHaveValue('taken.user');
});

test('blocks non-admin users without loading driver data', () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderPage();
  expect(screen.getByRole('heading', { name: /don't have access/i })).toBeInTheDocument();
  expect(api.getAdminDriver).not.toHaveBeenCalled();
});
