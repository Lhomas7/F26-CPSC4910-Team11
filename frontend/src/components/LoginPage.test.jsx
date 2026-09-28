import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
  fireEvent.click(screen.getByRole('checkbox', { name: /program terms/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Driver Account' }));

  await waitFor(() => {
    expect(api.registerDriver).toHaveBeenCalledWith({
      first_name: 'Jamie',
      last_name: 'Rivera',
      email: 'jamie@example.com',
      username: 'jamie.rivera',
      password: 'ExamplePassword123!',
      password_confirm: 'ExamplePassword123!',
      accepted_terms: true,
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

test('offers a backup code option and completes login with one when available', async () => {
  const signIn = jest.fn().mockResolvedValue({
    mfa: { required: true, enrolled: true, methods: ['totp'], backup_codes_remaining: 3 },
  });
  const completeMfaLogin = jest.fn().mockResolvedValue({ username: 'admin.one' });
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn,
    signOut: jest.fn(),
    completeMfaLogin,
    requestMfaLoginCode: jest.fn(),
  });

  renderLoginPage();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit');
  fireEvent.click(signInButton);

  await waitFor(() => expect(signIn).toHaveBeenCalledWith('admin.one', 'ExamplePassword123!'));
  expect(await screen.findByText('Two-step verification')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Use a backup code instead' }));
  expect(screen.getByLabelText('Backup code')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'ABCDE12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

  await waitFor(() => expect(completeMfaLogin).toHaveBeenCalledWith('backup', 'ABCDE12345'));
});

test('does not offer a backup code option when none remain', async () => {
  const signIn = jest.fn().mockResolvedValue({
    mfa: { required: false, enrolled: true, methods: ['email'] },
  });
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn,
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn().mockResolvedValue({ detail: 'sent' }),
  });

  renderLoginPage();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'driver.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit');
  fireEvent.click(signInButton);

  expect(await screen.findByText('Two-step verification')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use a backup code instead' })).not.toBeInTheDocument();
});

test('shows and hides the sign-in password without changing its value', () => {
  renderLoginPage();
  const password = screen.getByLabelText('Password');
  fireEvent.change(password, { target: { value: 'ExamplePassword123!' } });
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(password).toHaveValue('ExamplePassword123!');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(password).toHaveAttribute('type', 'password');
});

test('provides independent password visibility controls during registration', () => {
  renderLoginPage();
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.click(screen.getByRole('button', { name: /Driver.*Earn points/i }));
  const password = screen.getByLabelText('Password');
  const confirmation = screen.getByLabelText('Confirm Password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(confirmation).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
  expect(confirmation).toHaveAttribute('type', 'text');
});

test('sign in form links to the forgot password page', () => {
  renderLoginPage();

  expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
});

test('a signed-in user is redirected to the welcome page', async () => {
  useAuth.mockReturnValue({
    loading: false,
    user: { username: 'jamie.rivera', account_type: 'driver', name: 'Jamie Rivera' },
    signIn: jest.fn(),
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn(),
  });

  render(
    <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Welcome</div>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText('Welcome')).toBeInTheDocument();
});
