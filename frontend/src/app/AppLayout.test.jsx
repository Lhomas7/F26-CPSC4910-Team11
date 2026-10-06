import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { AppLayout } from './AppLayout';

jest.mock('../auth/AuthContext');

const USER = { username: 'jordan.lee', name: 'Jordan Lee', account_type: 'driver' };

function renderLayout(overrides = {}) {
  const auth = { user: USER, signOut: jest.fn().mockResolvedValue(), stopImpersonation: jest.fn(), ...overrides };
  useAuth.mockReturnValue(auth);
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppLayout />
    </MemoryRouter>,
  );
  return auth;
}

test('Sign out asks for confirmation before signing out', () => {
  const auth = renderLayout();

  userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

  const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
  expect(dialog).toHaveTextContent('Are you sure you want to sign out?');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(auth.signOut).not.toHaveBeenCalled();
});

test('Cancel keeps the user signed in and returns focus to Sign out', () => {
  const auth = renderLayout();
  const signOutButton = screen.getByRole('button', { name: 'Sign out' });

  userEvent.click(signOutButton);
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(signOutButton).toHaveFocus();
});

test('Escape and a backdrop click also cancel', () => {
  const auth = renderLayout();

  userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  userEvent.click(document.querySelector('.modal-backdrop'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(auth.signOut).not.toHaveBeenCalled();
});

test('confirming signs the user out', async () => {
  const auth = renderLayout();

  userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
  await act(async () => {
    userEvent.click(dialog.querySelector('.modal-button.primary'));
  });

  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Tab stays inside the dialog', () => {
  renderLayout();

  userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
  const [cancel, confirm] = dialog.querySelectorAll('button');

  userEvent.tab();
  expect(confirm).toHaveFocus();
  userEvent.tab();
  expect(cancel).toHaveFocus();
  userEvent.tab({ shift: true });
  expect(confirm).toHaveFocus();
});
