import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import AdminDetailPage from './AdminDetailPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

const account = {
  id: 8,
  first_name: 'Dana',
  last_name: 'Whitfield',
  username: 'dana.admin',
  email: 'dana@example.com',
  role: 'admin',
  is_active: true,
};

function renderPage() {
  return render(<MemoryRouter initialEntries={['/users/admins/8']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/users/admins/:userId" element={<AdminDetailPage />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { id: 1, account_type: 'admin' } });
  api.getAdminAccount.mockResolvedValue(account);
});

afterEach(() => jest.clearAllMocks());

test('loads and displays another administrator account', async () => {
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Loading administrator account');
  expect(await screen.findByRole('heading', { name: 'Dana Whitfield' })).toBeInTheDocument();
  expect(screen.getByText('dana@example.com')).toBeInTheDocument();
});

test('edits and saves another administrator account', async () => {
  api.updateAdminAccount.mockResolvedValue({ ...account, first_name: 'Danielle', is_active: false });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Danielle' } });
  fireEvent.change(screen.getByLabelText(/^Account status/), { target: { value: 'false' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(api.updateAdminAccount).toHaveBeenCalledWith('8', expect.objectContaining({
    first_name: 'Danielle',
    is_active: false,
  })));
  expect(await screen.findByText('Administrator account saved.')).toBeInTheDocument();
});

test('shows server validation errors and remains in edit mode', async () => {
  api.updateAdminAccount.mockRejectedValue({ data: { username: ['That username is already taken.'] } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
});

test('blocks non-admin users without loading account data', () => {
  useAuth.mockReturnValue({ user: { id: 2, account_type: 'driver' } });
  renderPage();

  expect(screen.getByRole('heading', { name: /don't have access/i })).toBeInTheDocument();
  expect(api.getAdminAccount).not.toHaveBeenCalled();
});
