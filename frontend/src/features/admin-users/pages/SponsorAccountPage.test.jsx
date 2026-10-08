import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../../../auth/AuthContext';
import * as api from '../../../api';
import SponsorAccountPage from './SponsorAccountPage';

jest.mock('../../../auth/AuthContext');
jest.mock('../../../api');

const account = {
  id: 8,
  first_name: 'Dana',
  last_name: 'Whitfield',
  username: 'dana.sponsor',
  email: 'dana@example.com',
  role: 'sponsor',
  sponsor_org: { id: 7, name: 'Palmetto Freight' },
  is_active: true,
};
const organizations = [
  { id: 7, name: 'Palmetto Freight' },
  { id: 9, name: 'Blue Ridge Logistics' },
];
const startImpersonation = jest.fn();

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/users/sponsors/8']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/users/sponsors/:userId" element={<SponsorAccountPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' }, startImpersonation });
  startImpersonation.mockResolvedValue({ account_type: 'sponsor' });
  api.getAdminSponsor.mockResolvedValue(account);
  api.getAdminSponsorOrganizations.mockResolvedValue(organizations);
});

afterEach(() => jest.clearAllMocks());

test('loads and displays sponsor account details', async () => {
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Loading sponsor account');
  expect(await screen.findByRole('heading', { name: 'Dana Whitfield' })).toBeInTheDocument();
  expect(screen.getByText('dana@example.com')).toBeInTheDocument();
  expect(screen.getByText('Palmetto Freight')).toBeInTheDocument();
});

test('edits and saves the sponsor account', async () => {
  api.updateAdminSponsor.mockResolvedValue({
    ...account,
    first_name: 'Danielle',
    sponsor_org: organizations[1],
    is_active: false,
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Danielle' } });
  fireEvent.change(screen.getByLabelText('Sponsor organization'), { target: { value: '9' } });
  fireEvent.change(screen.getByLabelText(/^Account status/), { target: { value: 'false' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(api.updateAdminSponsor).toHaveBeenCalledWith(
      '8',
      expect.objectContaining({ first_name: 'Danielle', sponsor_org_id: 9, is_active: false }),
    ),
  );
  expect(await screen.findByText('Sponsor account saved.')).toBeInTheDocument();
});

test('starts a view-as session for the sponsor', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'View as sponsor' }));
  await waitFor(() => expect(startImpersonation).toHaveBeenCalledWith('8'));
});

test('shows server validation errors and stays in edit mode', async () => {
  api.updateAdminSponsor.mockRejectedValue({
    data: { username: ['That username is already taken.'] },
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
});

test('blocks non-admin users without loading account data', () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderPage();
  expect(screen.getByRole('heading', { name: /don't have access/i })).toBeInTheDocument();
  expect(api.getAdminSponsor).not.toHaveBeenCalled();
});
