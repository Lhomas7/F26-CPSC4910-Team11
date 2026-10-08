import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import * as api from '../../../api';
import ResetPasswordPage from './ResetPasswordPage';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

const VALID_PASSWORD = 'ValidSecurePassword22!';

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/reset-password/Mg/abc-123']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillAndSubmit(password, confirmation = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

test('rejects a weak password before calling the API', () => {
  renderPage();

  fillAndSubmit('short');

  expect(screen.getByRole('alert')).toHaveTextContent(/at least 12 characters/i);
  expect(api.confirmPasswordReset).not.toHaveBeenCalled();
});

test('rejects mismatched passwords', () => {
  renderPage();

  fillAndSubmit(VALID_PASSWORD, 'DifferentSecurePass33!');

  expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
  expect(api.confirmPasswordReset).not.toHaveBeenCalled();
});

test('submits the uid and token from the link and shows success', async () => {
  api.confirmPasswordReset.mockResolvedValue({ detail: 'ok' });
  renderPage();

  fillAndSubmit(VALID_PASSWORD);

  await waitFor(() => expect(api.confirmPasswordReset).toHaveBeenCalledWith({
    uid: 'Mg',
    token: 'abc-123',
    password: VALID_PASSWORD,
    passwordConfirm: VALID_PASSWORD,
  }));
  expect(await screen.findByRole('status')).toHaveTextContent(/password has been reset/i);
  expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
});

test('offers a new link when the link is invalid or expired', async () => {
  const error = new Error('This password reset link is invalid or has expired.');
  error.status = 400;
  error.data = { detail: 'This password reset link is invalid or has expired.' };
  api.confirmPasswordReset.mockRejectedValue(error);
  renderPage();

  fillAndSubmit(VALID_PASSWORD);

  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
});

test('keeps the form open when the server rejects the password', async () => {
  const error = new Error('Password must not contain your username or email address.');
  error.status = 400;
  error.data = { password: ['Password must not contain your username or email address.'] };
  api.confirmPasswordReset.mockRejectedValue(error);
  renderPage();

  fillAndSubmit(VALID_PASSWORD);

  expect(await screen.findByRole('alert')).toHaveTextContent(/username or email/i);
  expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
});
