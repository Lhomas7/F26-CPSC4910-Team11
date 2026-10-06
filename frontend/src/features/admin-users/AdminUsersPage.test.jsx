import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import AdminUsersPage from './AdminUsersPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

const users = [
  { id: 1, display_name: 'Kylie Gilbert', username: 'kgilbert', role: 'admin', sponsor_org: null, is_active: true },
  { id: 2, display_name: 'Marcus Alvarez', username: 'malvarez', role: 'driver', sponsor_org: { id: 7, name: 'Palmetto Freight' }, is_active: true },
  { id: 3, display_name: 'Dana Whitfield', username: 'dwhitfield', role: 'sponsor', sponsor_org: { id: 7, name: 'Palmetto Freight' }, is_active: false },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  api.getAdminUsers.mockResolvedValue(users);
  api.getRegistrationSettings.mockResolvedValue({ email_verification_required: false });
});

afterEach(() => jest.clearAllMocks());

test('loads and displays the admin user directory', async () => {
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Loading users');
  expect(await screen.findByText('Marcus Alvarez')).toBeInTheDocument();
  expect(screen.getByText('@malvarez')).toBeInTheDocument();
  expect(screen.getAllByText('Palmetto Freight')).toHaveLength(2);
});

test('searches and filters the loaded directory', async () => {
  renderPage();
  await screen.findByText('Marcus Alvarez');
  fireEvent.change(screen.getByLabelText('Search by name or username'), { target: { value: 'dana' } });
  expect(screen.getByText('Dana Whitfield')).toBeInTheDocument();
  expect(screen.queryByText('Marcus Alvarez')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Drivers 1/ }));
  expect(screen.getByText(/Showing 0 of 3 users/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByText('Marcus Alvarez')).toBeInTheDocument();
});

test('does not call the API for a non-admin user', () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderPage();
  expect(screen.getByRole('heading', { name: /don\'t have access/i })).toBeInTheDocument();
  expect(api.getAdminUsers).not.toHaveBeenCalled();
});

test('offers retry when the directory request fails', async () => {
  api.getAdminUsers.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(users);
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Marcus Alvarez')).toBeInTheDocument();
  expect(api.getAdminUsers).toHaveBeenCalledTimes(2);
});
