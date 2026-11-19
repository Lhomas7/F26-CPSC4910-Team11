import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from 'auth/AuthContext';
import * as api from 'api';
import DriverAccountPage from './DriverAccountPage';

jest.mock('auth/AuthContext');
jest.mock('api');

const account = {
  id: 5,
  display_name: 'Tasha Greene',
  username: 'tasha.driver',
  email: 'tasha@example.com',
  role: 'driver',
  sponsor_memberships: [
    {
      sponsor: { id: 7, name: 'Palmetto Freight' },
      status: 'approved',
      point_balance: 1250,
      updated_at: '2026-11-01T12:00:00Z',
    },
  ],
  status_history: [
    {
      id: 1,
      sponsor: { id: 7, name: 'Palmetto Freight' },
      action: 'approved',
      reason: '',
      changed_by: 'Pat Sponsor',
      changed_at: '2026-11-01T12:00:00Z',
    },
  ],
  is_active: true,
  profile_picture_url: null,
};
const organizations = [
  { id: 7, name: 'Palmetto Freight' },
  { id: 9, name: 'Blue Ridge Logistics' },
];
const startImpersonation = jest.fn();

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/users/drivers/5']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/users/drivers/:userId" element={<DriverAccountPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({
    user: { account_type: 'admin', name: 'Kylie Gilbert' },
    startImpersonation,
  });
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
  const sponsors = screen.getByRole('region', { name: 'Sponsors' });
  const row = within(sponsors).getByRole('row', { name: /Palmetto Freight/ });
  expect(row).toHaveTextContent('Approved');
  expect(row).toHaveTextContent('1,250');
  expect(within(sponsors).getByText('Approved by sponsor')).toBeInTheDocument();
  expect(within(sponsors).getByText(/by Pat Sponsor/)).toBeInTheDocument();
  expect(screen.getByText('None uploaded')).toBeInTheDocument();
});

test('edits and deactivates a driver account', async () => {
  api.updateAdminDriver.mockResolvedValue({
    ...account,
    display_name: 'Tasha Green',
    is_active: false,
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Tasha Green' } });
  expect(screen.queryByLabelText(/^Sponsor organization/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Account status/), { target: { value: 'false' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  // Deactivating asks for the admin's own password first.
  const dialog = screen.getByRole('dialog', { name: 'Deactivate this account?' });
  fireEvent.change(within(dialog).getByLabelText('Your current password'), {
    target: { value: 'AdminPassword123!' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));
  await waitFor(() =>
    expect(api.updateAdminDriver).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({
        current_password: 'AdminPassword123!',
        display_name: 'Tasha Green',
        is_active: false,
      }),
    ),
  );
  expect(await screen.findByText('Driver account saved.')).toBeInTheDocument();
});

test('adds the driver to other sponsors, approved right away', async () => {
  api.assignDriverSponsors.mockResolvedValue({
    ...account,
    sponsor_memberships: [
      ...account.sponsor_memberships,
      {
        sponsor: { id: 9, name: 'Blue Ridge Logistics' },
        status: 'approved',
        point_balance: 0,
        updated_at: '2026-11-19T12:00:00Z',
      },
    ],
  });
  renderPage();

  const sponsors = await screen.findByRole('region', { name: 'Sponsors' });
  const add = within(sponsors).getByRole('group', { name: 'Add to sponsors' });
  // Sponsors the driver is already with aren't offered again.
  expect(within(add).queryByRole('checkbox', { name: 'Palmetto Freight' })).not.toBeInTheDocument();
  fireEvent.click(within(add).getByRole('checkbox', { name: 'Blue Ridge Logistics' }));
  fireEvent.click(within(sponsors).getByRole('button', { name: 'Add to selected sponsors' }));

  await waitFor(() => expect(api.assignDriverSponsors).toHaveBeenCalledWith('5', [9]));
  expect(await within(sponsors).findByRole('status')).toHaveTextContent(
    'Added to Blue Ridge Logistics.',
  );
  expect(within(sponsors).getByRole('row', { name: /Blue Ridge Logistics/ })).toHaveTextContent(
    'Approved',
  );
});

test('removing a sponsor requires a reason and changes only that membership', async () => {
  api.removeDriverSponsor.mockResolvedValue({
    ...account,
    sponsor_memberships: [{ ...account.sponsor_memberships[0], status: 'dropped' }],
    status_history: [
      {
        id: 2,
        sponsor: { id: 7, name: 'Palmetto Freight' },
        action: 'removed',
        reason: 'Left the fleet',
        changed_by: 'Kylie Gilbert',
        changed_at: '2026-11-19T12:00:00Z',
      },
      ...account.status_history,
    ],
  });
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Remove from Palmetto Freight' }));
  const dialog = screen.getByRole('dialog', { name: 'Remove Tasha Greene from Palmetto Freight?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from sponsor' }));
  expect(within(dialog).getByText('Enter a reason for removing this driver.')).toBeInTheDocument();
  expect(api.removeDriverSponsor).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText('Reason'), {
    target: { value: 'Left the fleet' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from sponsor' }));

  await waitFor(() =>
    expect(api.removeDriverSponsor).toHaveBeenCalledWith('5', 7, 'Left the fleet'),
  );
  const sponsors = screen.getByRole('region', { name: 'Sponsors' });
  expect(await within(sponsors).findByText('Reason: Left the fleet')).toBeInTheDocument();
  expect(within(sponsors).getByRole('row', { name: /Palmetto Freight/ })).toHaveTextContent(
    'Removed',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('confirms before starting a view-as session for the driver', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'View as driver' }));
  expect(startImpersonation).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'View as Tasha Greene?' });
  expect(dialog).toHaveTextContent('@tasha.driver');
  expect(dialog).toHaveTextContent('Palmetto Freight');
  expect(dialog).toHaveTextContent('stay signed in as Kylie Gilbert');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'View as driver' }));
  await waitFor(() => expect(startImpersonation).toHaveBeenCalledWith('5'));
});

test('explains why an inactive driver cannot be viewed as', async () => {
  api.getAdminDriver.mockResolvedValue({ ...account, is_active: false });
  renderPage();
  const button = await screen.findByRole('button', { name: 'View as driver' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription('Inactive accounts cannot be viewed as.');
});

test('explains the server MFA restriction before opening View-As', async () => {
  api.getAdminDriver.mockResolvedValue({
    ...account,
    view_as: {
      eligible: false,
      code: 'view_as_target_mfa_required',
      detail: 'This account must finish setting up multi-factor authentication.',
    },
  });
  renderPage();
  const button = await screen.findByRole('button', { name: 'View as driver' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(
    'This account must finish setting up multi-factor authentication.',
  );
  expect(startImpersonation).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('shows duplicate username errors while retaining edits', async () => {
  api.updateAdminDriver.mockRejectedValue({
    data: { username: ['That username is already taken.'] },
  });
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
