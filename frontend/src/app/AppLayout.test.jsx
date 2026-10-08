import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { AppLayout } from './AppLayout';

jest.mock('../auth/AuthContext');

const USER = { username: 'jordan.lee', name: 'Jordan Lee', account_type: 'driver' };

function renderLayout(overrides = {}) {
  const auth = {
    user: USER,
    signOut: jest.fn().mockResolvedValue(),
    stopImpersonation: jest.fn(),
    answerDeviceCheck: jest.fn().mockResolvedValue(),
    ...overrides,
  };
  useAuth.mockReturnValue(auth);
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppLayout />
    </MemoryRouter>,
  );
  return { auth };
}

function getSignOutButton() {
  userEvent.click(screen.getByRole('button', { name: /Profile menu for/i }));
  return screen.getByRole('menuitem', { name: 'Sign out' });
}

test('Sign out asks for confirmation before signing out', () => {
  const { auth } = renderLayout();

  userEvent.click(getSignOutButton());

  const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
  expect(dialog).toHaveTextContent('Are you sure you want to sign out?');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(auth.signOut).not.toHaveBeenCalled();
});

test('Cancel keeps the user signed in and dismisses the confirmation', () => {
  const { auth } = renderLayout();
  const signOutButton = getSignOutButton();

  userEvent.click(signOutButton);
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(signOutButton).not.toBeInTheDocument();
});

test('Escape and a backdrop click also cancel', () => {
  const { auth } = renderLayout();

  userEvent.click(getSignOutButton());
  userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  userEvent.click(getSignOutButton());
  // The backdrop is deliberately presentation-only, so it has no accessible query.
  // eslint-disable-next-line testing-library/no-node-access
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(auth.signOut).not.toHaveBeenCalled();
});

test('confirming signs the user out', async () => {
  const { auth } = renderLayout();

  userEvent.click(getSignOutButton());
  const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
  userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));

  await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('Tab stays inside the dialog', () => {
  renderLayout();

  userEvent.click(getSignOutButton());
  const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
  const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
  const confirm = within(dialog).getByRole('button', { name: 'Sign out' });

  userEvent.tab();
  expect(confirm).toHaveFocus();
  userEvent.tab();
  expect(cancel).toHaveFocus();
  userEvent.tab({ shift: true });
  expect(confirm).toHaveFocus();
});

test('no device question when none is pending', () => {
  renderLayout({ user: { ...USER, session: { device_check: null } } });

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a pending device question opens the dialog over the page', async () => {
  const { auth } = renderLayout({ user: { ...USER, session: { device_check: 'new_device' } } });

  expect(screen.getByRole('dialog', { name: 'Is this your device?' })).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'No, this is a shared or public device' }));
  await waitFor(() => expect(auth.answerDeviceCheck).toHaveBeenCalledWith(false));
});

test('an expired session is sent to the sign-in page', () => {
  useAuth.mockReturnValue({
    user: null,
    notice: 'expired',
    signOut: jest.fn(),
    stopImpersonation: jest.fn(),
    answerDeviceCheck: jest.fn(),
  });

  render(
    <MemoryRouter
      initialEntries={['/about']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/about" element={<p>About page</p>} />
        </Route>
        <Route path="/login" element={<p>Sign in page</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Sign in page')).toBeInTheDocument();
});
