import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../config/api';
import PasswordPanel from './PasswordPanel';

jest.mock('../config/api');

afterEach(() => jest.clearAllMocks());

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

test('is collapsed until the user chooses to change their password', () => {
  render(<PasswordPanel />);
  const toggle = screen.getByRole('button', { name: 'Change password' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByLabelText('New password')).toBeInTheDocument();
});

test('shows and hides each password field independently', () => {
  render(<PasswordPanel />);
  openPanel();

  const password = screen.getByLabelText('New password');
  const confirmation = screen.getByLabelText('Confirm new password');
  expect(password).toHaveAttribute('type', 'password');
  expect(confirmation).toHaveAttribute('type', 'password');

  fireEvent.click(screen.getByRole('button', { name: 'Show new password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(confirmation).toHaveAttribute('type', 'password');

  fireEvent.click(screen.getByRole('button', { name: 'Show confirm new password' }));
  expect(confirmation).toHaveAttribute('type', 'text');
});

test('validates the password before calling the API', () => {
  render(<PasswordPanel />);
  openPanel();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

  expect(screen.getByRole('alert')).toHaveTextContent('at least 12 characters');
  expect(api.changePassword).not.toHaveBeenCalled();
});

test('submits a valid password and clears the fields', async () => {
  api.changePassword.mockResolvedValue({});
  render(<PasswordPanel />);
  openPanel();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'ValidPassword!22' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'ValidPassword!22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

  await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('ValidPassword!22', 'ValidPassword!22'));
  expect(await screen.findByRole('status')).toHaveTextContent('Password changed successfully');
  expect(screen.getByLabelText('New password')).toHaveValue('');
  expect(screen.getByLabelText('Confirm new password')).toHaveValue('');
});

test('clears sensitive values when the panel closes', () => {
  render(<PasswordPanel />);
  openPanel();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'UnsubmittedPassword!2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  openPanel();

  expect(screen.getByLabelText('New password')).toHaveValue('');
});
