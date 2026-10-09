import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../api';
import { AuthProvider, useAuth } from './AuthContext';
import { API_ACTIVITY_EVENT, SESSION_EXPIRED_EVENT } from './sessionEvents';

jest.mock('../api');

function SignedInStatus() {
  const { loading, user, signOut } = useAuth();
  if (loading) return <p>Loading</p>;
  return (
    <>
      <p>{user ? `Signed in as ${user.username}` : 'Signed out'}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
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
  const { loading, user, notice, updateUser, answerDeviceCheck, stopImpersonation, clearNotice } =
    useAuth();
  if (loading) return <p>Loading</p>;
  return (
    <>
      <p>Device check: {user?.session?.device_check || 'none'}</p>
      <p>Name: {user?.name}</p>
      <p>Notice: {notice || 'none'}</p>
      <button type="button" onClick={() => answerDeviceCheck(true)}>
        Trust
      </button>
      <button
        type="button"
        onClick={() => updateUser({ ...user, session: undefined, name: 'Renamed' })}
      >
        Rename
      </button>
      <button type="button" onClick={stopImpersonation}>
        Stop viewing
      </button>
      <button type="button" onClick={clearNotice}>
        Clear notice
      </button>
      <button
        type="button"
        onClick={() => updateUser({ username: 'admin.one', account_type: 'admin' })}
      >
        Refresh as administrator
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
  api.deviceCheck.mockResolvedValue({
    session: { device_check: null, idle_timeout_seconds: null },
  });
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

test('stopping View-as restores the administrator with a return notice', async () => {
  api.ensureCsrf.mockResolvedValue();
  api.me.mockResolvedValue({
    authenticated: true,
    user: {
      username: 'driver.one',
      account_type: 'driver',
      impersonation: { active: true, admin: { username: 'admin.one' } },
    },
  });
  api.stopAdminImpersonation.mockResolvedValue({
    username: 'admin.one',
    account_type: 'admin',
  });
  render(
    <AuthProvider>
      <SessionStatus />
    </AuthProvider>,
  );
  expect(await screen.findByText('Name:')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Stop viewing' }));

  expect(await screen.findByText('Notice: view-as-returned')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear notice' }));
  expect(screen.getByText('Notice: none')).toBeInTheDocument();
});

test('a refreshed identity reports when View-as ended outside the explicit return action', async () => {
  api.ensureCsrf.mockResolvedValue();
  api.me.mockResolvedValue({
    authenticated: true,
    user: {
      username: 'driver.one',
      account_type: 'driver',
      impersonation: { active: true, admin: { username: 'admin.one' } },
    },
  });
  render(
    <AuthProvider>
      <SessionStatus />
    </AuthProvider>,
  );
  expect(await screen.findByText('Notice: none')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Refresh as administrator' }));

  expect(screen.getByText('Notice: view-as-ended')).toBeInTheDocument();
});

function NoticeStatus() {
  const { loading, user, notice } = useAuth();
  if (loading) return <p>Loading</p>;
  return <p>{user ? `Signed in as ${user.username}` : `Signed out (${notice || 'no notice'})`}</p>;
}

function renderWithIdleLimit(idleSeconds) {
  api.ensureCsrf.mockResolvedValue();
  api.logout.mockResolvedValue(null);
  api.me.mockResolvedValue({
    authenticated: true,
    user: {
      username: 'admin.one',
      account_type: 'admin',
      session: { device_check: null, idle_timeout_seconds: idleSeconds },
    },
  });
  return render(
    <AuthProvider>
      <NoticeStatus />
    </AuthProvider>,
  );
}

test('a server-reported expiry clears the user and sets the expired notice', async () => {
  renderWithIdleLimit(null);
  expect(await screen.findByText('Signed in as admin.one')).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  });

  expect(screen.getByText('Signed out (expired)')).toBeInTheDocument();
});

describe('idle timer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('signs out after the idle limit with no requests', async () => {
    renderWithIdleLimit(60);
    expect(await screen.findByText('Signed in as admin.one')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByText('Signed out (expired)')).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  test('API activity restarts the timer', async () => {
    renderWithIdleLimit(60);
    expect(await screen.findByText('Signed in as admin.one')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(45 * 1000);
      window.dispatchEvent(new Event(API_ACTIVITY_EVENT));
      jest.advanceTimersByTime(45 * 1000);
    });

    expect(screen.getByText('Signed in as admin.one')).toBeInTheDocument();
    expect(api.logout).not.toHaveBeenCalled();
  });

  test('no timer runs when the session has no idle limit', async () => {
    renderWithIdleLimit(null);
    expect(await screen.findByText('Signed in as admin.one')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });

    expect(screen.getByText('Signed in as admin.one')).toBeInTheDocument();
  });
});
