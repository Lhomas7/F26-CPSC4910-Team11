import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import * as api from '../../../api';
import AdminResetPasswordPage from './AdminResetPasswordPage';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

const VALID_PASSWORD = 'ValidSecurePassword22!';

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/admin-reset-password/Mg/abc-123']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/admin-reset-password/:uid/:token" element={<AdminResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillAndSubmit({ code = '123456', password = VALID_PASSWORD } = {}) {
  fireEvent.change(screen.getByLabelText('Authenticator app code'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

test('asks for a code before calling the API', () => {
  renderPage();

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: VALID_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

  expect(screen.getByRole('alert')).toHaveTextContent(/enter your authenticator app code/i);
  expect(api.confirmAdminPasswordReset).not.toHaveBeenCalled();
});

test('submits the link values, the code and the new password together', async () => {
  api.confirmAdminPasswordReset.mockResolvedValue({ detail: 'ok' });
  renderPage();

  fillAndSubmit();

  await waitFor(() =>
    expect(api.confirmAdminPasswordReset).toHaveBeenCalledWith({
      uid: 'Mg',
      token: 'abc-123',
      method: 'totp',
      code: '123456',
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(/password has been reset/i);
  expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
});

test('a wrong code keeps the form open and shows the server message', async () => {
  const error = new Error('That code is not valid.');
  error.status = 400;
  error.data = { code: ['That code is not valid.'] };
  api.confirmAdminPasswordReset.mockRejectedValue(error);
  renderPage();

  fillAndSubmit({ code: '000000' });

  expect(await screen.findByRole('alert')).toHaveTextContent('That code is not valid.');
  expect(screen.getByLabelText('New password')).toBeInTheDocument();
});

test('an invalid or expired link replaces the form', async () => {
  const error = new Error('This password reset link is invalid or has expired.');
  error.status = 400;
  error.data = { detail: 'This password reset link is invalid or has expired.' };
  api.confirmAdminPasswordReset.mockRejectedValue(error);
  renderPage();

  fillAndSubmit();

  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  expect(screen.getByText('Link expired')).toBeInTheDocument();
});
