import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../../../auth/AuthContext';
import * as api from '../../../api';
import AddUserPage from './AddUserPage';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../api');

const organizations = [{ id: 7, name: 'Palmetto Freight' }];

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AddUserPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  api.getAdminSponsorOrganizations.mockResolvedValue(organizations);
});

afterEach(() => jest.clearAllMocks());

function completeIdentityFields() {
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Jamie' } });
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Rivera' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'jamie.rivera' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jamie@example.com' } });
  fireEvent.change(screen.getByLabelText('Temporary password'), {
    target: { value: 'ExamplePassword123!' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'ExamplePassword123!' },
  });
}

test('creates a driver with the selected sponsor organization', async () => {
  api.createAdminUser.mockResolvedValue({
    id: 4,
    display_name: 'Jamie Rivera',
    username: 'jamie.rivera',
    role: 'driver',
    sponsor_org: organizations[0],
    is_active: true,
  });
  renderPage();
  await screen.findByRole('button', { name: 'Create driver account' });
  completeIdentityFields();
  fireEvent.change(screen.getByLabelText(/Sponsor organization/), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create driver account' }));

  await waitFor(() =>
    expect(api.createAdminUser).toHaveBeenCalledWith({
      first_name: 'Jamie',
      last_name: 'Rivera',
      username: 'jamie.rivera',
      email: 'jamie@example.com',
      role: 'driver',
      sponsor_org_id: 7,
      password: 'ExamplePassword123!',
      password_confirm: 'ExamplePassword123!',
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Driver account created' }),
  ).toBeInTheDocument();
});

test('requires an organization when creating a sponsor', async () => {
  renderPage();
  await screen.findByRole('button', { name: 'Create driver account' });
  fireEvent.click(screen.getByRole('radio', { name: /Sponsor.*Manages drivers/i }));
  completeIdentityFields();
  fireEvent.click(screen.getByRole('button', { name: 'Create sponsor account' }));
  expect(screen.getByText('Choose the organization this sponsor manages.')).toBeInTheDocument();
  expect(api.createAdminUser).not.toHaveBeenCalled();
});

test('does not load the form for non-admin users', () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderPage();
  expect(screen.getByRole('heading', { name: /don't have access/i })).toBeInTheDocument();
  expect(api.getAdminSponsorOrganizations).not.toHaveBeenCalled();
});

test('shows duplicate username returned by the API', async () => {
  api.createAdminUser.mockRejectedValue({
    status: 400,
    data: { username: ['That username is already taken.'] },
  });
  renderPage();
  await screen.findByRole('button', { name: 'Create driver account' });
  completeIdentityFields();
  fireEvent.click(screen.getByRole('button', { name: 'Create driver account' }));
  expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
});
