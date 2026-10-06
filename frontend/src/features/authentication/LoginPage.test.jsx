import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import LoginPage from './LoginPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

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
  api.currentRelease.mockResolvedValue(null);
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

  expect(container.querySelector('.login-lane .road-truck-loop')).toBeInTheDocument();
  expect(container.querySelector('.road-truck-cab')).toBeInTheDocument();
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

function fillDriverRegistration() {
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
}

const VERIFICATION_REQUIRED = {
  verification_required: true,
  email: 'jamie@example.com',
  detail: 'We sent a verification code to your email address.',
};

test('registration without required verification creates the account in one step', async () => {
  renderLoginPage();
  fillDriverRegistration();

  expect(await screen.findByText(/Driver account created successfully/i)).toBeInTheDocument();
  expect(api.registerDriver).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
});

test('required email verification asks for the code before creating the account', async () => {
  api.registerDriver
    .mockResolvedValueOnce(VERIFICATION_REQUIRED)
    .mockResolvedValueOnce({ username: 'jamie.rivera' });
  renderLoginPage();
  fillDriverRegistration();

  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
  expect(screen.getByText('jamie@example.com')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: ' 123456 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and create account' }));

  expect(await screen.findByText(/Driver account created successfully/i)).toBeInTheDocument();
  expect(api.registerDriver).toHaveBeenLastCalledWith(expect.objectContaining({
    email: 'jamie@example.com',
    username: 'jamie.rivera',
    password: 'ExamplePassword123!',
    code: '123456',
  }));
});

test('a rejected verification code shows the error and keeps the code step open', async () => {
  const rejected = Object.assign(new Error('Invalid or expired verification code.'), {
    status: 400,
    data: { code: ['Invalid or expired verification code.'] },
  });
  api.registerDriver
    .mockResolvedValueOnce(VERIFICATION_REQUIRED)
    .mockRejectedValueOnce(rejected);
  renderLoginPage();
  fillDriverRegistration();

  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and create account' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired verification code.');
  expect(screen.getByLabelText('Verification code')).toHaveValue('');
  expect(screen.queryByText(/account created successfully/i)).not.toBeInTheDocument();
});

test('verification step requires a code before submitting', async () => {
  api.registerDriver.mockResolvedValueOnce(VERIFICATION_REQUIRED);
  renderLoginPage();
  fillDriverRegistration();

  await screen.findByRole('heading', { name: 'Verify your email' });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and create account' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Enter the verification code from your email.');
  expect(api.registerDriver).toHaveBeenCalledTimes(1);
});

test('resend is held during the cooldown, then requests a new code', async () => {
  jest.useFakeTimers();
  try {
    api.registerDriver.mockResolvedValue(VERIFICATION_REQUIRED);
    renderLoginPage();
    fillDriverRegistration();

    const resend = await screen.findByRole('button', { name: /Resend code \(30s\)/ });
    expect(resend).toBeDisabled();

    for (let i = 0; i < 30; i += 1) {
      act(() => { jest.advanceTimersByTime(1000); });
    }
    const ready = screen.getByRole('button', { name: 'Resend code' });
    expect(ready).toBeEnabled();

    fireEvent.click(ready);
    expect(await screen.findByText('A new code was sent.')).toBeInTheDocument();
    expect(api.registerDriver).toHaveBeenCalledTimes(2);
    expect(api.registerDriver).toHaveBeenLastCalledWith(expect.not.objectContaining({ code: expect.anything() }));
  } finally {
    jest.useRealTimers();
  }
});

test('back from the verification step returns to the filled-in details', async () => {
  api.registerDriver.mockResolvedValueOnce(VERIFICATION_REQUIRED);
  renderLoginPage();
  fillDriverRegistration();

  await screen.findByRole('heading', { name: 'Verify your email' });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  expect(screen.getByLabelText('Email')).toHaveValue('jamie@example.com');
  expect(screen.getByRole('button', { name: 'Create Driver Account' })).toBeInTheDocument();
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

test('rejected credentials show the error and outline both fields in red', async () => {
  const signIn = jest.fn().mockRejectedValue(new Error('Invalid username or password.'));
  useAuth.mockReturnValue({ ...useAuth(), signIn });
  renderLoginPage();

  const username = screen.getByLabelText('Username');
  const password = screen.getByLabelText('Password');
  fireEvent.change(username, { target: { value: 'driver.one' } });
  fireEvent.change(password, { target: { value: 'WrongPassword1!' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit'));

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
  expect(username).toHaveValue('driver.one');
  expect(password).toHaveValue('');
  for (const field of [username, password]) {
    expect(field).toHaveClass('login-input-error');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'login-error');
  }

  fireEvent.change(username, { target: { value: 'driver.two' } });
  expect(username).not.toHaveClass('login-input-error');
  expect(username).not.toHaveAttribute('aria-invalid');
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

test('explains a sign-out caused by inactivity', () => {
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    notice: 'expired',
    signIn: jest.fn(),
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn(),
  });

  renderLoginPage();

  expect(screen.getByRole('status')).toHaveTextContent('You were signed out due to inactivity.');
});

test('the footer shows the current release from the About page data', async () => {
  api.currentRelease.mockResolvedValue({
    team_number: 11,
    version_number: 'Sprint 4',
    release_date: '2026-10-06',
    product_name: 'Good Driver Incentive Program',
    product_description: 'A rewards program for safer driving.',
  });

  renderLoginPage();

  expect(await screen.findByText('Team 11, Sprint 4')).toBeInTheDocument();
  expect(screen.queryByText(/v0\.1\.0/)).not.toBeInTheDocument();
});

test('the footer leaves the release out when none is available', async () => {
  renderLoginPage();

  await waitFor(() => expect(api.currentRelease).toHaveBeenCalled());
  expect(screen.queryByText(/^Team \d+/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'About this app' })).toBeInTheDocument();
});
