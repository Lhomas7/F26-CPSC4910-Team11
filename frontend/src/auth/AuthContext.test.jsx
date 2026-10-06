import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../api';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('../api');

function SignedInStatus() {
  const { loading, user, signOut } = useAuth();
  if (loading) return <p>Loading</p>;
  return (
    <>
      <p>{user ? `Signed in as ${user.username}` : 'Signed out'}</p>
      <button type="button" onClick={signOut}>Sign out</button>
    </>
  );
}

function renderWithSignedInDriver() {
  api.ensureCsrf.mockResolvedValue();
  api.me.mockResolvedValue({
    authenticated: true,
    user: { username: 'driver.one', account_type: 'driver' },
  });
  return render(
    <AuthProvider>
      <SignedInStatus />
    </AuthProvider>,
  );
}

afterEach(() => jest.clearAllMocks());

test('signing out calls the API and clears the user', async () => {
  api.logout.mockResolvedValue(null);
  renderWithSignedInDriver();
  expect(await screen.findByText('Signed in as driver.one')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  expect(await screen.findByText('Signed out')).toBeInTheDocument();
  expect(api.logout).toHaveBeenCalledTimes(1);
});

test('signing out clears the user even when the logout request fails', async () => {
  api.logout.mockRejectedValue(new Error('Network error'));
  renderWithSignedInDriver();
  expect(await screen.findByText('Signed in as driver.one')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Signed out')).toBeInTheDocument();
});

function SessionStatus() {
  const { loading, user, updateUser, answerDeviceCheck } = useAuth();
  if (loading) return <p>Loading</p>;
  return (
    <>
      <p>Device check: {user?.session?.device_check || 'none'}</p>
      <p>Name: {user?.name}</p>
      <button type="button" onClick={() => answerDeviceCheck(true)}>Trust</button>
      <button type="button" onClick={() => updateUser({ ...user, session: undefined, name: 'Renamed' })}>
        Rename
      </button>
    </>
  );
}

function renderWithPendingDeviceCheck() {
  api.ensureCsrf.mockResolvedValue();
  api.me.mockResolvedValue({
    authenticated: true,
    user: {
      username: 'driver.one',
      name: 'Driver One',
      account_type: 'driver',
      session: { device_check: 'new_device', idle_timeout_seconds: null },
    },
  });
  return render(
    <AuthProvider>
      <SessionStatus />
    </AuthProvider>,
  );
}

test('answering the device check stores the session the server returns', async () => {
  api.deviceCheck.mockResolvedValue({ session: { device_check: null, idle_timeout_seconds: null } });
  renderWithPendingDeviceCheck();
  expect(await screen.findByText('Device check: new_device')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Trust' }));

  expect(await screen.findByText('Device check: none')).toBeInTheDocument();
  expect(api.deviceCheck).toHaveBeenCalledWith(true);
});

test('profile updates without a session keep the current one', async () => {
  renderWithPendingDeviceCheck();
  expect(await screen.findByText('Device check: new_device')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

  expect(await screen.findByText('Name: Renamed')).toBeInTheDocument();
  expect(screen.getByText('Device check: new_device')).toBeInTheDocument();
});
