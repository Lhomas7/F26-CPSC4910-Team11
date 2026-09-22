import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import * as api from '../config/api';
import LoginPage from './LoginPage';

jest.mock('../auth/AuthContext');
jest.mock('../config/api');

beforeEach(() => {
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn(),
  });
  api.registerDriver.mockResolvedValue({ username: 'jamie.rivera' });
});

afterEach(() => jest.clearAllMocks());

function renderLoginPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginPage />
    </MemoryRouter>,
  );
}

test('renders the animated truck structure in the road lane', () => {
  const { container } = renderLoginPage();

  expect(container.querySelector('.login-truck')).toBeInTheDocument();
  expect(container.querySelector('.login-cab')).toBeInTheDocument();
});

test('driver registration sends separate name and email fields', async () => {
  renderLoginPage();
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.click(screen.getByRole('button', { name: /Driver.*Earn points/i }));

  fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jamie' } });
  fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Rivera' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jamie@example.com' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'jamie.rivera' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'ExamplePassword123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Driver Account' }));

  await waitFor(() => {
    expect(api.registerDriver).toHaveBeenCalledWith({
      first_name: 'Jamie',
      last_name: 'Rivera',
      email: 'jamie@example.com',
      username: 'jamie.rivera',
      password: 'ExamplePassword123!',
    });
  });
});

test('single-method MFA login stages, auto-requests the code, and shows the code entry screen', async () => {
  const signIn = jest.fn().mockResolvedValue({
    mfa: { required: false, enrolled: true, methods: ['email'] },
  });
  const requestMfaLoginCode = jest.fn().mockResolvedValue({ detail: 'Verification code sent.' });
  const completeMfaLogin = jest.fn().mockResolvedValue({ username: 'driver.one' });
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn,
    signOut: jest.fn(),
    completeMfaLogin,
    requestMfaLoginCode,
  });

  renderLoginPage();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'driver.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit');
  fireEvent.click(signInButton);

  await waitFor(() => expect(signIn).toHaveBeenCalledWith('driver.one', 'ExamplePassword123!'));
  await waitFor(() => expect(requestMfaLoginCode).toHaveBeenCalledWith('email'));
  expect(await screen.findByText('Two-step verification')).toBeInTheDocument();
  expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verify and sign in' })).toBeInTheDocument();
});
