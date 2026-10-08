import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../../api';
import ForgotPasswordPage from './ForgotPasswordPage';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

test('rejects an invalid email without calling the API', () => {
  renderPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
  expect(api.requestPasswordReset).not.toHaveBeenCalled();
});

test('requests a reset link and shows the generic confirmation', async () => {
  api.requestPasswordReset.mockResolvedValue({
    detail: 'If an account uses that email address, a password reset link has been sent.',
  });
  renderPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jamie@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith('jamie@example.com'));
  expect(await screen.findByRole('status')).toHaveTextContent(/a password reset link has been sent/i);
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
});

test('shows an error when the request fails', async () => {
  api.requestPasswordReset.mockRejectedValue(new Error('Network down'));
  renderPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jamie@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
});
